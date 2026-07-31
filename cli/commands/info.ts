import type { CliCommand } from '../args'
import { formatJson } from '../output'
import type { CliCommandHandler } from '../types'

export const infoCommand: CliCommandHandler<
  Extract<CliCommand, { kind: 'info' }>
> = {
  kind: 'info',
  run(_command, { deps, dataset }) {
    const manifest = dataset.manifest
    const payload = {
      appVersion: deps.appVersion,
      datasetVersion: manifest.datasetVersion,
      gameReleaseLine: manifest.gameReleaseLine,
      gameBuildId: manifest.gameBuildId,
      recordCounts: manifest.recordCounts,
    }
    return {
      exitCode: 0,
      stdout: _command.json
        ? formatJson(payload)
        : [
            `PalTools CLI ${deps.appVersion}`,
            `数据集：${manifest.datasetVersion}`,
            `游戏：${manifest.gameReleaseLine} (build ${manifest.gameBuildId})`,
            `帕鲁 ${manifest.recordCounts.pals} · 配方 ${manifest.recordCounts.recipes}`,
            '',
          ].join('\n'),
      stderr: '',
    }
  },
}