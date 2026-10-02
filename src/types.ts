export type Status = 'online' | 'offline' | 'pending' | 'unstable' | 'empty'
export type Range = '1h' | '6h' | '24h' | '7d'
export type Metric = 'online' | 'loss' | 'lossWindow' | 'latency' | 'jitter' | 'http' | 'httpLatency' | 'httpCode' | 'lastSeen' | 'flaps'
export interface Thresholds { lossWarning: number; lossUnstable: number; jitterUnstable: number; flapUnstable: number; sampleMaxAge: number; reportOfflineSeconds: number; nodeOfflineSeconds: number }
export interface Source { state: 'unconfigured' | 'ready' | 'partial' | 'error'; errors: { metric: string; code: string }[]; demo?: boolean }
export interface Sample { metric: Metric; value: number | null; target: string; probe: string; network: string; timestamp: number | null }
export interface Probe { id: string; network: string; reportState: 'online' | 'interrupted' | 'retired' | 'unknown'; lossMax: number | null; online: number | null; loss: number | null; lossWindow: number | null; latency: number | null; jitter: number | null; http: number | null; httpLatency: number | null; lastSeen: number | null; timestamp: number | null; status: Status; targets: Sample[] }
export interface Building { id: string; campus: string; group: string; building: string; name: string; status: Status; loss: number | null; lossWindow: number | null; latency: number | null; jitter: number | null; http: number | null; onlineProbes: number; totalProbes: number; retiredProbes: number; timestamp: number | null; probes: Probe[] }
export interface Campus { id: string; name: string; region: string }
export interface Overview { title: string; generatedAt: number; source: Source; refreshSeconds: number; thresholds: Thresholds; campuses: Campus[]; groups: Record<string, string>; counts: Record<Status, number>; buildings: Building[]; events?: EventData }
export interface Series { probe: string; network: string; target: string; points: [number, number | null][] }
export interface History { building: Pick<Building, 'id' | 'name' | 'campus' | 'group' | 'building'>; range: Range; start: number; end: number; duration: number; step: number; generatedAt: number; thresholds: Thresholds; source: Source; metrics: Partial<Record<Metric, Series[]>> }

export interface NetworkEvent { id: string; scope: 'building' | 'campus'; kind: 'loss' | 'offline' | 'mixed'; severity: 'warning' | 'critical'; campus: string; buildingId?: string; buildingName?: string; buildingIds?: string[]; title: string; message: string; since: number; value?: number; threshold?: number; criticalThreshold?: number; baselineAvailable?: boolean; affectedProbes?: { id: string; network: string; lastSeen?: number; value?: number; targets?: { target: string; value: number }[] }[]; p95?: number; p99?: number; affectedBuildings?: number; monitoredBuildings?: number }
export interface EventData { state: 'unconfigured' | 'disabled' | 'warming' | 'partial' | 'ready'; items: NetworkEvent[]; resolvedIds?: string[]; baselineBuildings: number; monitoredBuildings: number; evaluatedAt?: number }

export interface StatusSample { time: number; status: Status; online: number | null; loss: number | null; monitored: number }
export interface HistoricalIncident { id: string; campus: string; name: string; kind: 'offline' | 'loss'; start: number; end: number | null; outcome: 'ongoing' | 'resolved' | 'unknown'; severity: 'warning' | 'critical'; title: string; affectedBuildings: number; monitoredBuildings: number }
export interface StatusHistory { campuses: { id: string; name: string; availability: number | null; coverage: number; samples: StatusSample[] }[]; incidents: HistoricalIncident[]; start: number; end: number; step: number; generatedAt: number; source: Source }
