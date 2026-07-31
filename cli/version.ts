declare const __PALTOOLS_VERSION__: string | undefined

export const CLI_APP_VERSION =
  typeof __PALTOOLS_VERSION__ === 'string' && __PALTOOLS_VERSION__ !== ''
    ? __PALTOOLS_VERSION__
    : 'dev'
