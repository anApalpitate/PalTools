import { recipesForParents } from '../../src/domain/pals'
import type { CliCommand } from '../args'
import { resolvePalIdentity } from '../identity'
import { errorResult, type CliCommandHandler } from '../types'
import { identityError, recipeResult } from './results'

export const forwardCommand: CliCommandHandler<
  Extract<CliCommand, { kind: 'forward' }>
> = {
  kind: 'forward',
  run(command, { dataset, palsById }) {
    const parentA = resolvePalIdentity(dataset.pals, command.parentA)
    if (!parentA.ok) {
      return identityError(
        parentA.reason,
        command.parentA,
        parentA.candidates,
        command.json,
      )
    }
    const parentB = resolvePalIdentity(dataset.pals, command.parentB)
    if (!parentB.ok) {
      return identityError(
        parentB.reason,
        command.parentB,
        parentB.candidates,
        command.json,
      )
    }
    const recipes = recipesForParents(
      dataset.breedingIndex,
      parentA.pal!.internalId,
      parentB.pal!.internalId,
    )
    if (recipes.length === 0) {
      return errorResult(3, 'no-results', '当前组合没有正式配方。', command.json)
    }
    return recipeResult(
      recipes,
      dataset.manifest.datasetVersion,
      palsById,
      command.json,
    )
  },
}