import type { IconProps } from '@tamagui/helpers-icon'
import { themed } from '@tamagui/helpers-icon'
import PropTypes from 'prop-types'
import React, { memo } from 'react'
import {
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
  Svg,
  Symbol,
  Use,
  Circle as _Circle,
  Text as _Text,
} from 'react-native-svg'

const Icon = (props) => {
  const { color = 'black', size = 24, ...otherProps } = props
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...otherProps}
    >
      <Rect width="16" height="16" x="4" y="3" rx="2" stroke={color} />
      <Path d="M4 11h16" stroke={color} />
      <Path d="M12 3v8" stroke={color} />
      <Path d="m8 19-2 3" stroke={color} />
      <Path d="m18 22-2-3" stroke={color} />
      <Path d="M8 15h0" stroke={color} />
      <Path d="M16 15h0" stroke={color} />
    </Svg>
  )
}

Icon.displayName = 'TramFront'

export const TramFront = memo<IconProps>(themed(Icon))
