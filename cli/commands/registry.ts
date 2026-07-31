import type { CliCommandHandler } from '../types'
import { forwardCommand } from './forward'
import { infoCommand } from './info'
import { planValidateCommand } from './plan-validate'
import { reverseCommand } from './reverse'
import { searchCommand } from './search'

export const COMMAND_HANDLERS: ReadonlyMap<string, CliCommandHandler<any>> =
  new Map<string, CliCommandHandler<any>>([
    [infoCommand.kind, infoCommand],
    [searchCommand.kind, searchCommand],
    [forwardCommand.kind, forwardCommand],
    [reverseCommand.kind, reverseCommand],
    [planValidateCommand.kind, planValidateCommand],
  ])