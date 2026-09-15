import React from 'react';
import Svg, { Path, Circle, Line } from 'react-native-svg';

export interface TabIconProps {
  size?: number;
  color: string;
  /** Background color of the bar — used for knockout shapes inside filled active icons. */
  bgColor?: string;
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Home — Filled house (active) / Outlined house (inactive)
// Reference: rounded roof peak, rectangular body, door cutout.
// ---------------------------------------------------------------------------
export function HomeTabIcon({ size = 24, color, active = false }: TabIconProps) {
  if (active) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5h-4v-5.25a1.5 1.5 0 0 0-1.5-1.5h-4a1.5 1.5 0 0 0-1.5 1.5v5.25h-4A1.5 1.5 0 0 1 3 20V10.5z"
          fill={color}
        />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 10.5L12 3.5l8.5 7V20a1.5 1.5 0 0 1-1.5 1.5h-3.5v-5.25a1.5 1.5 0 0 0-1.5-1.5h-4a1.5 1.5 0 0 0-1.5 1.5v5.25H5A1.5 1.5 0 0 1 3.5 20V10.5z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Categories — Magnifying glass.
// Reference: outlined circle lens with inner shine arc, diagonal handle line.
// Active = thicker stroked outline / Inactive = thinner outline. Both are outline-only.
// ---------------------------------------------------------------------------
export function CategoriesTabIcon({ size = 24, color, active = false }: TabIconProps) {
  const sw = active ? 2.4 : 2;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.5} cy={10.5} r={6.5} stroke={color} strokeWidth={sw} />
      {/* Inner lens shine — cubic bezier stays well inside the circle */}
      <Path
        d="M11.5 6.8c1.8.4 3 1.6 3.4 3.4"
        stroke={color}
        strokeWidth={active ? 2 : 1.8}
        strokeLinecap="round"
        fill="none"
      />
      <Line
        x1={15.5}
        y1={15.5}
        x2={21}
        y2={21}
        stroke={color}
        strokeWidth={sw + 0.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Sell — Plus in a circle.
// Reference: thin-walled circle, centred + crosshairs.
// Active = filled circle with knockout plus / Inactive = outlined.
// ---------------------------------------------------------------------------
export function SellTabIcon({ size = 24, color, bgColor, active = false }: TabIconProps) {
  if (active) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={10} fill={color} />
        <Line x1={12} y1={7} x2={12} y2={17} stroke={bgColor ?? '#1C1C1C'} strokeWidth={2.4} strokeLinecap="round" />
        <Line x1={7} y1={12} x2={17} y2={12} stroke={bgColor ?? '#1C1C1C'} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.5} stroke={color} strokeWidth={1.8} />
      <Line x1={12} y1={7.5} x2={12} y2={16.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={7.5} y1={12} x2={16.5} y2={12} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Inbox — Speech bubble with heart inside.
// Active = filled bubble with knockout heart / Inactive = outlined bubble + filled heart.
// ---------------------------------------------------------------------------
export function InboxTabIcon({ size = 24, color, bgColor, active = false }: TabIconProps) {
  const bubblePath =
    'M4 4.5h16A2.5 2.5 0 0 1 22.5 7v7.5A2.5 2.5 0 0 1 20 17h-9.5L6.5 20.5a.8.8 0 0 1-1.3-.65V17H4A2.5 2.5 0 0 1 1.5 14.5V7A2.5 2.5 0 0 1 4 4.5z';
  const heartPath =
    'M12 9c-.8-1.2-2.3-1.5-3.3-.5-1.2 1.1-1 2.7.2 3.9L12 15.5l3.1-3.1c1.2-1.2 1.4-2.8.2-3.9-1-.9-2.5-.7-3.3.5z';

  if (active) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d={bubblePath} fill={color} />
        <Path d={heartPath} fill={bgColor ?? '#1C1C1C'} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={bubblePath} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d={heartPath} fill={color} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Account — Person silhouette inside a circle.
// Active = filled circle with knockout head + shoulder / Inactive = outlined.
// ---------------------------------------------------------------------------
export function AccountTabIcon({ size = 24, color, bgColor, active = false }: TabIconProps) {
  if (active) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={10} fill={color} />
        <Circle cx={12} cy={9.5} r={3.2} fill={bgColor ?? '#1C1C1C'} />
        <Path
          d="M6.2 18.5c.7-2.8 3-4.5 5.8-4.5s5.1 1.7 5.8 4.5"
          stroke={bgColor ?? '#1C1C1C'}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.5} stroke={color} strokeWidth={1.8} />
      <Circle cx={12} cy={9.5} r={3.2} stroke={color} strokeWidth={1.8} />
      <Path
        d="M6.2 18.5c.7-2.8 3-4.5 5.8-4.5s5.1 1.7 5.8 4.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}
