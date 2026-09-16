CREATE TABLE photo_exports (media_uri TEXT PRIMARY KEY NOT NULL, photo_uri TEXT, pending INTEGER NOT NULL DEFAULT 0);
CREATE INDEX photo_exports_owner ON photo_exports(photo_uri);
INSERT INTO photo_exports (media_uri, photo_uri, pending) SELECT media_uri, uri, pending FROM photos WHERE media_uri IS NOT NULL;
