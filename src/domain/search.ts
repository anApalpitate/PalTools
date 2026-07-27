export function normalizeSearchTerm(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN')
}

export function matchesPaldexNumber(
  paldexNumber: string | null,
  rawQuery: string,
): boolean {
  const query = normalizeSearchTerm(rawQuery)

  if (!query) {
    return true
  }

  if (!paldexNumber) {
    return false
  }

  const normalizedNumber = paldexNumber.toLocaleLowerCase('zh-CN')
  const withoutLeadingZeroes = (value: string) => value.replace(/^0+(?=\d)/, '')

  return (
    normalizedNumber.startsWith(query) ||
    withoutLeadingZeroes(normalizedNumber).startsWith(withoutLeadingZeroes(query))
  )
}
