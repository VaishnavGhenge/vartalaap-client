import { Aperture } from "lucide-react";
import { ControlButton } from "./ControlButton";

interface BlurButtonProps {
  enabled: boolean;
  onToggle: () => void;
}

export function BlurButton({ enabled, onToggle }: BlurButtonProps) {
  return (
    <ControlButton
      onClick={onToggle}
      active={enabled}
      activeIcon={Aperture}
      inactiveIcon={Aperture}
      activeLabel="Disable background blur"
      inactiveLabel="Enable background blur"
    />
  );
}
