from datetime import datetime

from pydantic import BaseModel


class LatencyBucket(BaseModel):
    le: float | None  # upper bound in ms; null is the open-ended bucket
    count: int  # cumulative


class RouteMetrics(BaseModel):
    method: str
    route: str
    requests: int
    client_errors: int
    server_errors: int
    error_rate: float
    mean_ms: float
    max_ms: float


class RequestMetrics(BaseModel):
    since: datetime
    uptime_seconds: float
    requests: int
    client_errors: int
    server_errors: int
    error_rate: float
    latency_ms: list[LatencyBucket]
    routes: list[RouteMetrics]


class OutboxMetrics(BaseModel):
    pending: int
    ready: int
    retrying: int
    leased: int
    expired_leases: int
    dead: int
    oldest_ready_age_seconds: float | None


class OutboxKindMetrics(BaseModel):
    kind: str
    pending: int
    leased: int
    dead: int


class DeliveryMetrics(BaseModel):
    pending: int
    ready: int
    failed: int
    oldest_ready_age_seconds: float | None


class JobMetrics(BaseModel):
    outbox: OutboxMetrics
    outbox_by_kind: list[OutboxKindMetrics]
    notification_email: DeliveryMetrics


class OperationsMetrics(BaseModel):
    generated_at: datetime
    requests: RequestMetrics
    jobs: JobMetrics
