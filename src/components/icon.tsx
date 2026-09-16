import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import Camera01Icon from "@hugeicons/core-free-icons/Camera01Icon";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import Clock01Icon from "@hugeicons/core-free-icons/Clock01Icon";
import DashboardSquare01Icon from "@hugeicons/core-free-icons/DashboardSquare01Icon";
import DashboardSquare02Icon from "@hugeicons/core-free-icons/DashboardSquare02Icon";
import Delete02Icon from "@hugeicons/core-free-icons/Delete02Icon";
import Download04Icon from "@hugeicons/core-free-icons/Download04Icon";
import EqualSignIcon from "@hugeicons/core-free-icons/EqualSignIcon";
import FavouriteIcon from "@hugeicons/core-free-icons/FavouriteIcon";
import FlashIcon from "@hugeicons/core-free-icons/FlashIcon";
import FlashOffIcon from "@hugeicons/core-free-icons/FlashOffIcon";
import GithubIcon from "@hugeicons/core-free-icons/GithubIcon";
import GridIcon from "@hugeicons/core-free-icons/GridIcon";
import Image02Icon from "@hugeicons/core-free-icons/Image02Icon";
import InformationCircleIcon from "@hugeicons/core-free-icons/InformationCircleIcon";
import Location01Icon from "@hugeicons/core-free-icons/Location01Icon";
import LockKeyholeIcon from "@hugeicons/core-free-icons/LockKeyholeIcon";
import PlusMinusCircle01Icon from "@hugeicons/core-free-icons/PlusMinusCircle01Icon";
import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import Share01Icon from "@hugeicons/core-free-icons/Share01Icon";
import SquareIcon from "@hugeicons/core-free-icons/SquareIcon";
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon";
import TimerOffIcon from "@hugeicons/core-free-icons/TimerOffIcon";
import VibrateIcon from "@hugeicons/core-free-icons/VibrateIcon";
import VolumeHighIcon from "@hugeicons/core-free-icons/VolumeHighIcon";
import { HugeiconsIcon } from "@hugeicons/react-native";

import { colors } from "@/lib/theme";

const compactFlashOff: typeof FlashOffIcon = FlashOffIcon.map(
  ([tag, attrs]) => [
    tag,
    attrs.key === "2"
      ? {
          ...attrs,
          transform: "translate(12 12) scale(0.94) translate(-12 -12)",
        }
      : attrs,
  ]
);

const icons = {
  "flash-off": compactFlashOff,
  "timer-off": TimerOffIcon,
  exposure: PlusMinusCircle01Icon,
  aspect: SquareIcon,
  github: GithubIcon,
  download: Download04Icon,
  "layout-grid": DashboardSquare01Icon,
  "layout-masonry": DashboardSquare02Icon,

  back: ArrowLeft01Icon,
  camera: Camera01Icon,
  check: Tick02Icon,
  clock: Clock01Icon,
  close: Cancel01Icon,
  flash: FlashIcon,
  gallery: Image02Icon,
  grid: GridIcon,
  haptics: VibrateIcon,
  heart: FavouriteIcon,
  info: InformationCircleIcon,
  level: EqualSignIcon,
  lock: LockKeyholeIcon,
  location: Location01Icon,
  settings: Settings01Icon,
  share: Share01Icon,
  trash: Delete02Icon,
  volume: VolumeHighIcon,
};

export type IconName = keyof typeof icons;
export function Icon({
  name,
  size = 24,
  color = colors.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <HugeiconsIcon
      icon={icons[name]}
      size={size}
      color={color}
      strokeWidth={1.5}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    />
  );
}
