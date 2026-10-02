import type { History, Series, Status, Thresholds } from '../src/types'
export function classify(probes: { reportState?: string; lossMax?: number | null; online?: number | null; loss?: number | null; lossWindow?: number | null; jitter?: number | null; flaps?: number | null; latency?: number | null; http?: number | null }[], thresholds: Thresholds, incomplete?: boolean): Status
export function timelineForProbe(history: History, series: Series): { start: number; end: number; status: Status }[]
