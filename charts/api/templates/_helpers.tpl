{{/*
Nome curto do chart, truncado para caber no limite de 63 caracteres de nomes de
objeto do Kubernetes quando combinado com sufixos.
*/}}
{{- define "ifix-api.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Nome completo do release. `helm install ifix ./charts/api` produz `ifix-ifix-api` a
menos que o nome do release já contenha o nome do chart — o mesmo padrão que
`helm create` gera, reaproveitado aqui em vez de reinventado.
*/}}
{{- define "ifix-api.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "ifix-api.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "ifix-api.labels" -}}
helm.sh/chart: {{ include "ifix-api.chart" . }}
{{ include "ifix-api.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "ifix-api.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ifix-api.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "ifix-api.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "ifix-api.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}
