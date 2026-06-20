import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken')
  const isPublicRoute = config.url?.startsWith('/api/public/') || config.url?.startsWith('/api/parcours/')
  if (token && !isPublicRoute) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

const unwrap = (response) => response.data

export const studentApi = {
  metiers: () => api.get('/api/public/metiers').then(unwrap),
  search: (payload) => api.post('/api/parcours/generate', payload, { timeout: 120000 }).then(unwrap),
  share: (payload) => api.post('/api/parcours/share', payload).then(unwrap),
  exportPdf: (payload) =>
    api.post('/api/parcours/export', payload, { responseType: 'blob' }).then(unwrap),
  shared: (token) => api.get(`/api/parcours/shared/${token}`).then(unwrap),
}

export const adminApi = {
  login: (payload) => api.post('/api/auth/login', payload).then(unwrap),
  changePassword: (payload) => api.post('/api/auth/change-password', payload).then(unwrap),
  stats: () => api.get('/api/admin/dashboard/quality').then(unwrap),
  nodes: (params = {}) => api.get('/api/admin/nodes', { params }).then(unwrap),
  createNode: (payload) => api.post('/api/admin/nodes', payload).then(unwrap),
  updateNode: (id, payload) => api.put(`/api/admin/nodes/${id}`, payload).then(unwrap),
  deleteNode: (id) => api.delete(`/api/admin/nodes/${id}`).then(unwrap),
  edges: () => api.get('/api/admin/edges').then(unwrap),
  createEdge: (payload) => api.post('/api/admin/edges', payload).then(unwrap),
  updateEdge: (id, payload) => api.put(`/api/admin/edges/${id}`, payload).then(unwrap),
  deleteEdge: (id) => api.delete(`/api/admin/edges/${id}`).then(unwrap),
  logs: () => api.get('/api/admin/logs').then(unwrap),
  exportNodesCsv: () => api.get('/api/admin/csv/export/nodes', { responseType: 'blob' }).then(unwrap),
  exportEdgesCsv: () => api.get('/api/admin/csv/export/edges', { responseType: 'blob' }).then(unwrap),
  uploadNodesCsv: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/api/admin/csv/import/nodes', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(unwrap)
  },
  uploadEdgesCsv: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/api/admin/csv/import/edges', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(unwrap)
  },
  createAdmin: (payload) => api.post('/api/admin/users', payload).then(unwrap),
  uploadRagDocument: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/api/admin/rag/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    }).then(unwrap)
  },
}
