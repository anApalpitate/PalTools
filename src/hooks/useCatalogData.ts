import { useEffect, useState } from 'react'
import type {
  ActiveSkillRecord,
  BreedingIndexPayload,
  DatasetManifest,
  ElementRecord,
  ElementsPayload,
  ItemRecord,
  ItemsPayload,
  PalRecord,
  PalsPayload,
  SkillsPayload,
  WorkSuitabilitiesPayload,
  WorkSuitabilityRecord,
} from '../domain/types'
import { localAssetUrl } from '../lib/assets'

export function useCatalogData() {
  const [pals, setPals] = useState<PalRecord[]>([])
  const [elementRecords, setElementRecords] = useState<ElementRecord[]>([])
  const [skills, setSkills] = useState<ActiveSkillRecord[]>([])
  const [items, setItems] = useState<ItemRecord[]>([])
  const [workSuitabilityRecords, setWorkSuitabilityRecords] = useState<
    WorkSuitabilityRecord[]
  >([])
  const [manifest, setManifest] = useState<DatasetManifest | null>(null)
  const [loadingError, setLoadingError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetch(localAssetUrl('/data/pals.json'), {
        signal: controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error('图鉴数据加载失败')
        return response.json() as Promise<PalsPayload>
      }),
      fetch(localAssetUrl('/data/elements.json'), {
        signal: controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error('属性素材数据加载失败')
        return response.json() as Promise<ElementsPayload>
      }),
      fetch(localAssetUrl('/data/skills.json'), {
        signal: controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error('主动技能数据加载失败')
        return response.json() as Promise<SkillsPayload>
      }),
      fetch(localAssetUrl('/data/items.json'), {
        signal: controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error('掉落物数据加载失败')
        return response.json() as Promise<ItemsPayload>
      }),
      fetch(localAssetUrl('/data/work-suitabilities.json'), {
        signal: controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error('工作适应性素材数据加载失败')
        return response.json() as Promise<WorkSuitabilitiesPayload>
      }),
      fetch(localAssetUrl('/data/manifest.json'), {
        signal: controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error('数据清单加载失败')
        return response.json() as Promise<DatasetManifest>
      }),
    ])
      .then(
        ([
          palData,
          elementData,
          skillData,
          itemData,
          workData,
          manifestData,
        ]) => {
          setPals(palData.pals)
          setElementRecords(elementData.elements)
          setSkills(skillData.skills)
          setItems(itemData.items)
          setWorkSuitabilityRecords(workData.workSuitabilities)
          setManifest(manifestData)
        },
      )
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          setLoadingError(error.message)
        }
      })
    return () => controller.abort()
  }, [])

  return {
    pals,
    elementRecords,
    skills,
    items,
    workSuitabilityRecords,
    manifest,
    loadingError,
    setLoadingError,
  }
}

export function useBreedingIndex(
  active: boolean,
  onError: (message: string) => void,
) {
  const [breedingIndex, setBreedingIndex] =
    useState<BreedingIndexPayload | null>(null)

  useEffect(() => {
    if (!active || breedingIndex) return
    fetch(localAssetUrl('/data/breeding-index.json'))
      .then((response) => {
        if (!response.ok) throw new Error('配种数据加载失败')
        return response.json() as Promise<BreedingIndexPayload>
      })
      .then(setBreedingIndex)
      .catch((error: unknown) =>
        onError(error instanceof Error ? error.message : '配种数据加载失败'),
      )
  }, [active, breedingIndex, onError])

  return breedingIndex
}
