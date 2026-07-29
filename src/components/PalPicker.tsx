import { useEffect, useMemo, useRef, useState } from 'react'
import { matchesPalIdentityQuery } from '../domain/search'
import type { PalRecord } from '../domain/types'
import { LocalPalImage } from './pal-ui'

function palOptionLabel(pal: PalRecord): string {
  return `${pal.name.zhHans} · ${pal.name.en} · ${
    pal.paldexNo ? `#${pal.paldexNo}` : '无编号'
  }`
}

export function PalPicker({
  id,
  label,
  pals,
  selectedId,
  onSelect,
}: {
  id: string
  label: string
  pals: PalRecord[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const selected = pals.find((pal) => pal.internalId === selectedId)
  const [inputValue, setInputValue] = useState('')
  const [queryValue, setQueryValue] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const options = useMemo(
    () => new Map(pals.map((pal) => [palOptionLabel(pal), pal.internalId])),
    [pals],
  )
  const filtered = useMemo(() => {
    const query = queryValue.trim().toLocaleLowerCase('zh-CN')
    return query
      ? pals.filter((pal) => matchesPalIdentityQuery(pal, query))
      : pals
  }, [pals, queryValue])

  useEffect(() => {
    setInputValue(selected ? palOptionLabel(selected) : '')
  }, [selected])

  useEffect(() => {
    setActiveIndex((current) =>
      Math.max(0, Math.min(filtered.length - 1, current)),
    )
  }, [filtered.length])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as globalThis.Node)) {
        setOpen(false)
        setQueryValue('')
        setInputValue(selected ? palOptionLabel(selected) : '')
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open, selected])

  useEffect(() => {
    if (!open) return
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, open])

  const choose = (pal: PalRecord) => {
    setInputValue(palOptionLabel(pal))
    setQueryValue('')
    onSelect(pal.internalId)
    setOpen(false)
    inputRef.current?.focus()
  }

  const openAll = () => {
    const selectedIndex = selected
      ? pals.findIndex((pal) => pal.internalId === selected.internalId)
      : 0
    setQueryValue('')
    setActiveIndex(Math.max(0, selectedIndex))
    setOpen(true)
    if (selected) requestAnimationFrame(() => inputRef.current?.select())
  }

  return (
    <div className="field pal-picker" ref={rootRef}>
      <label htmlFor={`${id}-input`}>{label}</label>
      <input
        id={`${id}-input`}
        ref={inputRef}
        value={inputValue}
        placeholder="输入中文名、英文名或编号"
        aria-label={label}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={
          open && filtered[activeIndex]
            ? `${id}-option-${filtered[activeIndex].internalId}`
            : undefined
        }
        onFocus={openAll}
        onClick={() => {
          const showingSelectedValue =
            selected && inputValue === palOptionLabel(selected)
          if (!open || showingSelectedValue) openAll()
        }}
        onChange={(event) => {
          const value = event.target.value
          setInputValue(value)
          setQueryValue(value)
          setActiveIndex(0)
          setOpen(true)
          const exactId = options.get(value)
          if (exactId) onSelect(exactId)
          else if (!value) onSelect('')
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) {
              setOpen(true)
              return
            }
            const delta = event.key === 'ArrowDown' ? 1 : -1
            setActiveIndex((current) =>
              Math.max(0, Math.min(filtered.length - 1, current + delta)),
            )
          } else if (event.key === 'Home' && open) {
            event.preventDefault()
            setActiveIndex(0)
          } else if (event.key === 'End' && open) {
            event.preventDefault()
            setActiveIndex(Math.max(0, filtered.length - 1))
          } else if (event.key === 'Enter' && open && filtered[activeIndex]) {
            event.preventDefault()
            choose(filtered[activeIndex])
          } else if (event.key === 'Escape') {
            setOpen(false)
            setQueryValue('')
            setInputValue(selected ? palOptionLabel(selected) : '')
          }
        }}
      />
      {open && (
        <div
          className="pal-picker-options themed-scrollbar"
          id={`${id}-options`}
          role="listbox"
        >
          {filtered.length === 0 ? (
            <span className="pal-picker-empty">没有匹配的帕鲁</span>
          ) : filtered.map((pal, index) => (
            <button
              type="button"
              id={`${id}-option-${pal.internalId}`}
              role="option"
              aria-selected={pal.internalId === selectedId}
              className={index === activeIndex ? 'is-active' : ''}
              data-option-index={index}
              key={pal.internalId}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(pal)}
            >
              <LocalPalImage pal={pal} size="tree" />
              <span>
                <strong>{pal.name.zhHans}</strong>
                <small>
                  {pal.name.en} · {pal.paldexNo ? `#${pal.paldexNo}` : '无编号'}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
