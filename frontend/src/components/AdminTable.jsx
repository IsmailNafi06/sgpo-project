import { useState } from 'react'

export default function AdminTable({ title, items, fields, onCreate, onUpdate, onDelete }) {
  const empty = Object.fromEntries(fields.map((f) => [f.key, '']))
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState(null)
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')

  const getValue = (item, key) => {
    if (key === 'sourceId') return item.source?.id ?? item.sourceId ?? ''
    if (key === 'targetId') return item.target?.id ?? item.targetId ?? ''
    return item[key] ?? ''
  }

  const visibleFields = fields.filter((field) => field.table !== false)

  const openAdd = () => {
    setEditingId(null)
    setForm(empty)
    setIsOpen(true)
  }

  const openEdit = (item) => {
    setEditingId(item.id)
    setForm(
      Object.fromEntries(
        fields.map((f) => {
          const val = getValue(item, f.key)
          return [f.key, val !== null && val !== undefined ? String(val) : '']
        }),
      ),
    )
    setIsOpen(true)
  }

  const closeModal = () => {
    setIsOpen(false)
    setEditingId(null)
    setForm(empty)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (editingId) {
      await onUpdate(editingId, form)
    } else {
      await onCreate(form)
    }
    closeModal()
  }

  const filtered = search
    ? items.filter((item) =>
        visibleFields.some((f) => {
          const raw = String(getValue(item, f.key)).toLowerCase()
          const displayed = f.display ? String(f.display(getValue(item, f.key), item)).toLowerCase() : raw
          const q = search.toLowerCase()
          return raw.includes(q) || displayed.includes(q)
        }),
      )
    : items

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
      {/* Toolbar */}
      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/70 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-brand-navy dark:text-white">{title}</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-400">
              {items.length} entree{items.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button type="button" onClick={openAdd} className="primary-btn shrink-0 py-2 text-sm">
            + Ajouter
          </button>
        </div>
        <div className="mt-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="field bg-white py-2 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-900/50">
              {visibleFields.map((f) => (
                <th key={f.key} className="px-5 py-3 font-black">
                  {f.label}
                </th>
              ))}
              <th className="px-5 py-3 font-black">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((item) => (
              <tr key={item.id || JSON.stringify(item)} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
                {visibleFields.map((f) => {
                  const raw = getValue(item, f.key)
                  const content = f.display ? f.display(raw, item) : String(raw || '-')
                  return (
                    <td key={f.key} className={`px-5 py-3 text-slate-700 dark:text-slate-300 ${f.cellClass || ''}`}>
                      {f.badge ? (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${f.badge(raw)}`}>
                          {content}
                        </span>
                      ) : (
                        content
                      )}
                    </td>
                  )
                })}
                <td className="px-5 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="inline-flex items-center rounded-xl border border-brand-blue/30 bg-brand-blueSoft px-3 py-1.5 text-xs font-bold text-brand-blue transition hover:bg-brand-blueSoft/60 dark:border-blue-700/40 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="inline-flex items-center rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950/60"
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={visibleFields.length + 1} className="px-6 py-16 text-center">
                  <p className="font-semibold text-slate-400">
                    {search ? `Aucun resultat pour "${search}"` : 'Aucune donnee disponible'}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-[1.75rem] bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between bg-brand-navy px-6 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-200">{title}</p>
                <h3 className="mt-0.5 text-lg font-black text-white">
                  {editingId ? "Modifier l'entree" : 'Nouvelle entree'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm text-white transition hover:bg-white/30"
              >
                x
              </button>
            </div>
            <form onSubmit={submit} className="p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((f) => (
                  <div key={f.key} className={f.full ? 'sm:col-span-2' : ''}>
                    <label className="label">{f.label}</label>
                    {f.options ? (
                      <select
                        value={form[f.key]}
                        onChange={(e) => setForm((c) => ({ ...c, [f.key]: e.target.value }))}
                        className="field"
                      >
                        <option value="">- Selectionner -</option>
                        {f.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={form[f.key]}
                        onChange={(e) => setForm((c) => ({ ...c, [f.key]: e.target.value }))}
                        className="field"
                        placeholder={f.placeholder || f.label}
                        type={f.inputType || 'text'}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button type="button" onClick={closeModal} className="secondary-btn py-2 text-sm">
                  Annuler
                </button>
                <button type="submit" className="primary-btn text-sm">
                  {editingId ? 'Enregistrer les modifications' : 'Creer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

