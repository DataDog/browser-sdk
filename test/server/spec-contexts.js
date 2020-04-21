const specContexts = new Map()

module.exports = {
  specContexts: (req, res, next) => {
    const specId = req.query['spec-id'] || 'unknown'
    if (!specContexts.has(specId)) {
      specContexts.set(specId, { id: specId, logs: [], rum: [], monitoring: [] })
    }
    req.specContext = specContexts.get(specId)
    next()
  },
  clean: (specContext) => {
    specContexts.delete(specContext.id)
  },
}
