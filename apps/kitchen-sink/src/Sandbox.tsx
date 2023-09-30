// import './wdyr'

import { memo, useState } from 'react'
import { Appearance, Button, View } from 'react-native'
import { ListItem, ListItemFrame, Square, Theme } from 'tamagui'

export const Sandbox = () => {
  return (
    <View
      style={{ width: '100%', height: '100%', backgroundColor: 'yellow', padding: 50 }}
    >
      <ThemeChangeTest />
    </View>
  )
}

function ThemeChangeTest() {
  const [x, setX] = useState('dark' as any)

  return (
    <>
      <Button
        title="change"
        onPress={() => {
          const next = x === 'dark' ? 'light' : 'dark'
          Appearance.setColorScheme(next)
          setX(next)
        }}
      />
      <Theme name="blue">
        <Theme name={x}>
          <Children />
        </Theme>
      </Theme>
    </>
  )
}

const Children = memo(() => {
  return (
    <>
      <ListItem w={200} h={200} />
      <Square
        // animation="bouncy"
        // animateOnly={['backgroundColor']}
        size={100}
        bc="$background"
      />
    </>
  )
})
