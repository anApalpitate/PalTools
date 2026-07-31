import { recipesForChild } from '../../src/domain/pals'
import type { CliCommand } from '../args'
import { resolvePalIdentity } from '../identity'
import { errorResult, type CliCommandHandler } from '../types'
import { identityError, recipeResult } from './results'

export const reverseCommand: CliCommandHandler<
  Extract<CliCommand, { kind: 'reverse' }>
> = {
  kind: 'reverse',
  run(command, { dataset, palsById }) {
    const target = resolvePalIdentity(dataset.pals, command.target)
    if (!target.ok) {
      return identityError(
        target.reason,
        command.target,
        target.candidates,
        command.json,
      )
    }
    const recipes = recipesForChild(
      dataset.breedingIndex,
      target.pal!.internalId,
    )
    if (recipes.length === 0) {
      return errorResult(3, 'no-results', '该帕鲁没有可用亲本配方。', command.json)
    }
    return recipeResult(
      recipes,
      dataset.manifest.datasetVersion,
      palsById,
      command.json,
    )
  },
}