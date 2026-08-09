interface NavigatorWithMobileHint {
  userAgent: string
  maxTouchPoints?: number
  userAgentData?: {
    mobile?: boolean
  }
}

const MOBILE_USER_AGENT =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i

export function isMobileDevice(
  deviceNavigator: NavigatorWithMobileHint = navigator,
): boolean {
  if (deviceNavigator.userAgentData?.mobile === true) return true
  if (MOBILE_USER_AGENT.test(deviceNavigator.userAgent)) return true

  return (
    deviceNavigator.maxTouchPoints !== undefined &&
    deviceNavigator.maxTouchPoints > 1 &&
    /Macintosh/i.test(deviceNavigator.userAgent)
  )
}
