{{/*
Nome curto do chart, truncado para caber no limite de 63 caracteres de nomes de
objeto do Kubernetes quando combinado com sufixos.
*/}}
{{- define "ifix-workers.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Nome completo do release — mesma convenção do chart do api.
*/}}
{{- define "ifix-workers.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "ifix-workers.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "ifix-workers.labels" -}}
helm.sh/chart: {{ include "ifix-workers.chart" . }}
{{ include "ifix-workers.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "ifix-workers.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ifix-workers.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "ifix-workers.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "ifix-workers.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}
