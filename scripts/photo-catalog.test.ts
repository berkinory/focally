import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const migration = (version: number) =>
  readFile(
    new URL(
      `../modules/focally-camera/android/src/main/assets/focally-photos-v${version}.sql`,
      import.meta.url
    ),
    "utf-8"
  );

test("catalog upgrade preserves photos and favorites while tracking multiple exports independently", async () => {
  const db = new Database(":memory:");
  try {
    db.run(await migration(1));
    db.run(`INSERT INTO photos (uri, width, height, captured, size, favorite, original, media_uri, pending) VALUES
      ('file:///private.jpg', 1200, 800, 1000, 700, 1, 0, 'content://media/1', 0),
      ('content://media/2', 4000, 3000, 999, 800, 1, 1, 'content://media/2', 0),
      ('file:///pending.jpg', 800, 1200, 1001, 600, 0, 0, 'content://media/3', 1),
      ('file:///local.jpg', 1200, 800, 1002, 500, 0, 0, NULL, 0)`);
    const before = db.query("SELECT * FROM photos ORDER BY id").all();
    db.run(await migration(2));
    expect(db.query("SELECT * FROM photos ORDER BY id").all()).toEqual(before);
    expect(
      db.query("SELECT * FROM photo_exports ORDER BY media_uri").all()
    ).toEqual([
      {
        media_uri: "content://media/1",
        photo_uri: "file:///private.jpg",
        pending: 0,
      },
      {
        media_uri: "content://media/2",
        photo_uri: "content://media/2",
        pending: 0,
      },
      {
        media_uri: "content://media/3",
        photo_uri: "file:///pending.jpg",
        pending: 1,
      },
    ]);
    const insert = db.query(
      "INSERT INTO photo_exports (media_uri, photo_uri) VALUES (?, ?)"
    );
    insert.run("content://media/4", "file:///private.jpg");
    expect(() =>
      insert.run("content://media/4", "file:///local.jpg")
    ).toThrow();
    expect(
      db
        .query(
          "SELECT media_uri FROM photo_exports WHERE photo_uri = ? ORDER BY media_uri"
        )
        .all("file:///private.jpg")
    ).toEqual([
      { media_uri: "content://media/1" },
      { media_uri: "content://media/4" },
    ]);
    db.query(
      "UPDATE photo_exports SET photo_uri = NULL WHERE photo_uri = ?"
    ).run("file:///private.jpg");
    db.query("DELETE FROM photos WHERE uri = ?").run("file:///private.jpg");
    expect(
      db
        .query(
          "SELECT media_uri FROM photo_exports WHERE photo_uri IS NULL ORDER BY media_uri"
        )
        .all()
    ).toEqual([
      { media_uri: "content://media/1" },
      { media_uri: "content://media/4" },
    ]);
  } finally {
    db.close();
  }
});
