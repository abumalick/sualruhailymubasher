# Book viewer visual fixture

`tawhid-v1-p235.pdf` is a book PDF inherited from the fork, used only as rendering test data. It uses
embedded Type 1C subset fonts with WinAnsi encoding and no ToUnicode map, the case that
broke in the app.

`tawhid-v1-p235.poppler.png` is poppler's render of it, the reference the viewer is compared to.

Regenerate both from the full volume:

```sh
pdfseparate -f 235 -l 235 SharhKitaabAtTawheed_IbnIbraheem_01.pdf tawhid-v1-p235.pdf
pdftoppm -gray -r 100 -singlefile -png tawhid-v1-p235.pdf tawhid-v1-p235.poppler
```
