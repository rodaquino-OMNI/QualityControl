{{/*
Expand the name of the chart.
*/}}
{{- define "austa-cockpit.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "austa-cockpit.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "austa-cockpit.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "austa-cockpit.labels" -}}
helm.sh/chart: {{ include "austa-cockpit.chart" . }}
{{ include "austa-cockpit.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "austa-cockpit.selectorLabels" -}}
app.kubernetes.io/name: {{ include "austa-cockpit.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "austa-cockpit.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "austa-cockpit.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
PostgreSQL host
*/}}
{{- define "austa-cockpit.postgresql.host" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "%s-postgresql" (include "austa-cockpit.fullname" .) }}
{{- else }}
{{- .Values.externalDatabase.host }}
{{- end }}
{{- end }}

{{/*
PostgreSQL port
*/}}
{{- define "austa-cockpit.postgresql.port" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.primary.service.ports.postgresql }}
{{- else }}
{{- .Values.externalDatabase.port }}
{{- end }}
{{- end }}

{{/*
PostgreSQL database name
*/}}
{{- define "austa-cockpit.postgresql.database" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.auth.database }}
{{- else }}
{{- .Values.externalDatabase.database }}
{{- end }}
{{- end }}

{{/*
PostgreSQL username
*/}}
{{- define "austa-cockpit.postgresql.username" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.auth.username }}
{{- else }}
{{- .Values.externalDatabase.username }}
{{- end }}
{{- end }}

{{/*
PostgreSQL secret name
*/}}
{{- define "austa-cockpit.postgresql.secretName" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "%s-postgresql" (include "austa-cockpit.fullname" .) }}
{{- else }}
{{- printf "%s-database" (include "austa-cockpit.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Redis host
*/}}
{{- define "austa-cockpit.redis.host" -}}
{{- if .Values.redis.enabled }}
{{- printf "%s-redis-master" (include "austa-cockpit.fullname" .) }}
{{- else }}
{{- .Values.externalRedis.host }}
{{- end }}
{{- end }}

{{/*
Redis port
*/}}
{{- define "austa-cockpit.redis.port" -}}
{{- if .Values.redis.enabled }}
{{- .Values.redis.master.service.ports.redis }}
{{- else }}
{{- .Values.externalRedis.port }}
{{- end }}
{{- end }}

{{/*
MongoDB host
*/}}
{{- define "austa-cockpit.mongodb.host" -}}
{{- if .Values.mongodb.enabled }}
{{- printf "%s-mongodb" (include "austa-cockpit.fullname" .) }}
{{- else }}
{{- .Values.externalMongodb.host }}
{{- end }}
{{- end }}

{{/*
MongoDB port
*/}}
{{- define "austa-cockpit.mongodb.port" -}}
{{- if .Values.mongodb.enabled }}
{{- .Values.mongodb.service.ports.mongodb }}
{{- else }}
{{- .Values.externalMongodb.port }}
{{- end }}
{{- end }}