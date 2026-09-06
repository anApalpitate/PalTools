import { useEffect, useMemo, useState } from 'react'
import {
  filterAndSortBreedingRecipes,
  filterAndSortRecipesForParent,
  legendaryPalIds,
  recipeMatchesForChild,
  recipeMatchesForParent,
  recipeMatchesForParents,
} from '../../domain/pals'
import type {
  BreedingRecipeSortDirection,
  BreedingRecipeSortKey,
} from '../../domain/pals'
import { matchesPalIdentityQuery } from '../../domain/search'
import type {
  BreedingIndexPayload,
  BreedingRecipeMatch,
  PalRecord,
} from '../../domain/types'
import { ForwardBreedingPanel } from './ForwardBreedingPanel'
import { ReverseBreedingPanel } from './ReverseBreedingPanel'
import { SolutionWorkspace } from './SolutionWorkspace'
import { useBreedingWorkspace } from './useBreedingWorkspace'

type BreedingMode = 'forward' | 'reverse' | 'solution'

interface BreedingPageProps {
  pals: PalRecord[]
  breedingIndex: BreedingIndexPayload | null
  datasetVersion?: string
  mode?: BreedingMode
  reverseTarget?: string
  forwardParentA?: string
  forwardParentB?: string
  onModeChange?: (mode: BreedingMode) => void
  onReverseTargetChange?: (palId: string) => void
  onNavigateToPaldex?: (palId: string) => void
}

export function BreedingPage({
  pals,
  breedingIndex,
  datasetVersion = '',
  mode: controlledMode,
  reverseTarget: controlledReverseTarget,
  forwardParentA = '',
  forwardParentB = '',
  onModeChange,
  onReverseTargetChange,
  onNavigateToPaldex,
}: BreedingPageProps) {
  const [localMode, setLocalMode] = useState<BreedingMode>('forward')
  const mode = controlledMode ?? localMode
  const setMode = (nextMode: BreedingMode) => {
    if (controlledMode === undefined) setLocalMode(nextMode)
    onModeChange?.(nextMode)
  }
  const [parentA, setParentA] = useState(forwardParentA)
  const [parentB, setParentB] = useState(forwardParentB)
  const [forwardQuery, setForwardQuery] = useState('')
  const [forwardExcludeLegendary, setForwardExcludeLegendary] = useState(false)
  const [forwardExcludeSelfBreeding, setForwardExcludeSelfBreeding] = useState(false)
  const [forwardSortKey, setForwardSortKey] =
    useState<BreedingRecipeSortKey>('paldexNo')
  const [forwardSortDirection, setForwardSortDirection] =
    useState<BreedingRecipeSortDirection>('asc')
  const [forwardPage, setForwardPage] = useState(1)
  const [localReverseTarget, setLocalReverseTarget] = useState('')
  const reverseTarget = controlledReverseTarget ?? localReverseTarget
  const setReverseTarget = (palId: string) => {
    if (controlledReverseTarget === undefined) setLocalReverseTarget(palId)
    onReverseTargetChange?.(palId)
  }
  const [selectedAvatarKey, setSelectedAvatarKey] = useState('')
  const activateAvatar = (key: string, palId: string) => {
    if (selectedAvatarKey === key) onNavigateToPaldex?.(palId)
    else setSelectedAvatarKey(key)
  }
  const [reverseQuery, setReverseQuery] = useState('')
  const [reverseExcludeLegendary, setReverseExcludeLegendary] = useState(false)
  const [reverseExcludeSelfBreeding, setReverseExcludeSelfBreeding] = useState(false)
  const [reverseSortKey, setReverseSortKey] =
    useState<BreedingRecipeSortKey>('paldexNo')
  const [reverseSortDirection, setReverseSortDirection] =
    useState<BreedingRecipeSortDirection>('asc')
  const [reversePage, setReversePage] = useState(1)
  const workspaceController = useBreedingWorkspace(breedingIndex, datasetVersion)
  const bagRecipeIndexes = useMemo(
    () => new Set(workspaceController.workspace?.relations.filter((relation) => relation.inBag).map((relation) => relation.recipeIndex) ?? []),
    [workspaceController.workspace],
  )
  const addToBag = (recipe: BreedingRecipeMatch) => void workspaceController.addToBag(recipe)

  const palsById = useMemo(
    () => new Map(pals.map((pal) => [pal.internalId, pal])),
    [pals],
  )
  const legendaryIds = useMemo(
    () => breedingIndex ? legendaryPalIds(breedingIndex) : new Set<string>(),
    [breedingIndex],
  )
  const breedingPals = useMemo(
    () =>
      breedingIndex
        ? pals.filter((pal) => breedingIndex.palIds.includes(pal.internalId))
        : pals.filter((pal) => pal.internalId !== 'WorldTreeDragon'),
    [pals, breedingIndex],
  )
  const singleParentId =
    parentA && !parentB ? parentA : parentB && !parentA ? parentB : ''
  const singleParentAllRecipes = useMemo(
    () =>
      breedingIndex && singleParentId
        ? recipeMatchesForParent(breedingIndex, singleParentId)
        : [],
    [breedingIndex, singleParentId],
  )
  const forwardRecipes = useMemo(() => {
    if (!breedingIndex) return []
    if (parentA && parentB) {
      return filterAndSortBreedingRecipes(
        recipeMatchesForParents(breedingIndex, parentA, parentB),
        palsById,
        {
          legendaryIds,
          excludeLegendary: forwardExcludeLegendary,
          excludeSelfBreeding: forwardExcludeSelfBreeding,
          sortKey: forwardSortKey,
          sortDirection: forwardSortDirection,
          identityIds: (recipe) => [recipe.childId],
        },
      )
    }
    if (singleParentId) {
      return filterAndSortRecipesForParent(
        singleParentAllRecipes,
        singleParentId,
        palsById,
        forwardQuery,
        {
          legendaryIds,
          excludeLegendary: forwardExcludeLegendary,
          excludeSelfBreeding: forwardExcludeSelfBreeding,
          sortKey: forwardSortKey,
          sortDirection: forwardSortDirection,
        },
      )
    }
    return []
  }, [
    breedingIndex,
    forwardExcludeLegendary,
    forwardExcludeSelfBreeding,
    forwardQuery,
    forwardSortDirection,
    forwardSortKey,
    legendaryIds,
    palsById,
    parentA,
    parentB,
    singleParentAllRecipes,
    singleParentId,
  ])
  const forwardPages = Math.max(1, Math.ceil(forwardRecipes.length / 50))
  const forwardPageItems = singleParentId
    ? forwardRecipes.slice((forwardPage - 1) * 50, forwardPage * 50)
    : forwardRecipes
  const reverseRecipes = useMemo(() => {
    if (!breedingIndex || !reverseTarget) return []
    const queryText = reverseQuery.trim().toLocaleLowerCase('zh-CN')
    const matchingRecipes = recipeMatchesForChild(breedingIndex, reverseTarget)
      .filter((recipe) => {
        if (!queryText) return true
        const parentARecord = palsById.get(recipe.parentAId)
        const parentBRecord = palsById.get(recipe.parentBId)
        return [parentARecord, parentBRecord].some(
          (pal) => pal && matchesPalIdentityQuery(pal, queryText),
        )
      })
    return filterAndSortBreedingRecipes(matchingRecipes, palsById, {
      legendaryIds,
      excludeLegendary: reverseExcludeLegendary,
      excludeSelfBreeding: reverseExcludeSelfBreeding,
      sortKey: reverseSortKey,
      sortDirection: reverseSortDirection,
      identityIds: (recipe) => [recipe.parentAId, recipe.parentBId],
    })
  }, [
    breedingIndex,
    legendaryIds,
    palsById,
    reverseExcludeLegendary,
    reverseExcludeSelfBreeding,
    reverseQuery,
    reverseSortDirection,
    reverseSortKey,
    reverseTarget,
  ])
  const reversePages = Math.max(1, Math.ceil(reverseRecipes.length / 50))
  const reversePageItems = reverseRecipes.slice(
    (reversePage - 1) * 50,
    reversePage * 50,
  )

  useEffect(() => {
    setForwardQuery('')
    setForwardPage(1)
  }, [parentA, parentB])

  useEffect(() => {
    setParentA(forwardParentA)
    setParentB(forwardParentB)
  }, [forwardParentA, forwardParentB])

  useEffect(() => {
    setForwardPage(1)
  }, [forwardExcludeLegendary, forwardExcludeSelfBreeding, forwardQuery, forwardSortDirection, forwardSortKey])

  useEffect(() => {
    setReversePage(1)
  }, [reverseExcludeLegendary, reverseExcludeSelfBreeding, reverseQuery, reverseSortDirection, reverseSortKey, reverseTarget])

  return (
    <main className="breeding-page">
      <section className="page-heading page-heading--breeding">
        <div>
          <p className="eyebrow">BREEDING / 44,851 条无性别公式</p>
          <h1>配种工具</h1>
        </div>
      </section>

      <nav className="breeding-mode-tabs" aria-label="配种功能" role="tablist">
        {([
          ['forward', '双亲查子代'],
          ['reverse', '获取目标帕鲁'],
          ['solution', '配种方案网'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            id={`breeding-tab-${value}`}
            role="tab"
            aria-selected={mode === value}
            aria-controls={`breeding-panel-${value}`}
            tabIndex={mode === value ? 0 : -1}
            className={mode === value ? 'is-active' : ''}
            onClick={() => setMode(value)}
            onKeyDown={(event) => {
              const modes: BreedingMode[] = ['forward', 'reverse', 'solution']
              const current = modes.indexOf(value)
              const next = event.key === 'ArrowRight' ? (current + 1) % modes.length
                : event.key === 'ArrowLeft' ? (current - 1 + modes.length) % modes.length
                  : event.key === 'Home' ? 0 : event.key === 'End' ? modes.length - 1 : -1
              if (next >= 0) {
                event.preventDefault()
                setMode(modes[next])
                document.getElementById(`breeding-tab-${modes[next]}`)?.focus()
              }
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {!breedingIndex ? (
        <section className="breeding-workspace result-placeholder">
          <h2>正在载入配方索引…</h2>
        </section>
      ) : mode === 'forward' ? (
        <div role="tabpanel" id="breeding-panel-forward" aria-labelledby="breeding-tab-forward">
        <ForwardBreedingPanel
          pals={breedingPals}
          palsById={palsById}
          parentA={parentA}
          parentB={parentB}
          setParentA={setParentA}
          setParentB={setParentB}
          singleParentId={singleParentId}
          query={forwardQuery}
          excludeLegendary={forwardExcludeLegendary}
          excludeSelfBreeding={forwardExcludeSelfBreeding}
          sortKey={forwardSortKey}
          sortDirection={forwardSortDirection}
          page={forwardPage}
          pages={forwardPages}
          totalRecipes={singleParentAllRecipes.length}
          recipes={forwardRecipes}
          pageItems={forwardPageItems}
          setQuery={setForwardQuery}
          setExcludeLegendary={setForwardExcludeLegendary}
          setExcludeSelfBreeding={setForwardExcludeSelfBreeding}
          setSortKey={setForwardSortKey}
          setSortDirection={setForwardSortDirection}
          setPage={setForwardPage}
          bagRecipeIndexes={bagRecipeIndexes}
          onAddToBag={addToBag}
          bagReady={Boolean(workspaceController.workspace)}
                    legendaryIds={legendaryIds}
          selectedAvatarKey={selectedAvatarKey}
          onAvatarActivate={activateAvatar}
        />
        </div>
      ) : mode === 'reverse' ? (
        <div role="tabpanel" id="breeding-panel-reverse" aria-labelledby="breeding-tab-reverse">
        <ReverseBreedingPanel
          pals={breedingPals}
          palsById={palsById}
          target={reverseTarget}
          query={reverseQuery}
          excludeLegendary={reverseExcludeLegendary}
          excludeSelfBreeding={reverseExcludeSelfBreeding}
          sortKey={reverseSortKey}
          sortDirection={reverseSortDirection}
          page={reversePage}
          pages={reversePages}
          recipes={reverseRecipes}
          pageItems={reversePageItems}
          setTarget={setReverseTarget}
          setQuery={setReverseQuery}
          setExcludeLegendary={setReverseExcludeLegendary}
          setExcludeSelfBreeding={setReverseExcludeSelfBreeding}
          setSortKey={setReverseSortKey}
          setSortDirection={setReverseSortDirection}
          setPage={setReversePage}
          bagRecipeIndexes={bagRecipeIndexes}
          onAddToBag={addToBag}
          bagReady={Boolean(workspaceController.workspace)}
          legendaryIds={legendaryIds}
          selectedAvatarKey={selectedAvatarKey}
          onAvatarActivate={activateAvatar}
        />
        </div>
      ) : (
        <div role="tabpanel" id="breeding-panel-solution" aria-labelledby="breeding-tab-solution">
          <SolutionWorkspace
            pals={pals}
            breedingIndex={breedingIndex}
            datasetVersion={datasetVersion}
            controller={workspaceController}
            onNavigateToQuery={setMode}
            selectedAvatarKey={selectedAvatarKey}
            onAvatarActivate={activateAvatar}
          />
        </div>
      )}
    </main>
  )
}
