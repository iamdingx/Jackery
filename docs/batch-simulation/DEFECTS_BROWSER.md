# Browser simulation defects

No browser simulation failures in this run.



## Prior runs retained

- UI-R1-20261030: 98/100. C081: AssertionError [ERR_ASSERTION]: fault snapshot retains exact source citation; C084: locator.uncheck: Timeout 5000ms exceeded.. Full original per-case evidence remains in BROWSER_RESULTS.json priorRuns.

## R1 harness causes and R2 closure

- C081: legal baseline deliberately selected no faults; runner needed to select F0 through the UI before inspecting its snapshot. Repaired; UI saved F0 and every snapshot field was compared to model knowledge.
- C084: iterating a dynamic `:checked` locator changed indexes as items were unchecked. Repaired by capturing stable fault codes before UI unchecking.
- Neither required production changes. Full R2: 100/100 pass; supplementary requested combinations: 3/3 pass. No unresolved production browser defect was identified by these runs.
