# Flashcard import vendors

| File | Upstream package | Version | License |
| --- | --- | --- | --- |
| `fflate/index.mjs` | fflate | 0.8.2 | MIT, `fflate/LICENSE` |
| `fzstd/index.mjs` | fzstd | 0.1.1 | MIT, `fzstd/LICENSE` |
| `sql-wasm.js`, `sql-wasm.wasm`, `sql-wasm-node.cjs` | sql.js | 1.13.0 | MIT, `sqljs-LICENSE` |

The SQL.js browser file exports the package initializer as an ES module and clears the CommonJS global assignment for strict module execution. The `.cjs` copy keeps Node-based parser tests compatible with the package's CommonJS build. The browser route imports the browser initializer and wasm only when the import flow is used.
