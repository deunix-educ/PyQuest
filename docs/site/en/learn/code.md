# Writing and running code

## Cells

Each exercise has a **cell**: a code area, and below it the output and the validation result.

| Action | How |
|---|---|
| Run | **Run** button or `Ctrl + Enter` (`Cmd + Enter` on Mac) |
| Stop a running program | **Stop** button (useful against an infinite loop) |
| Start over | **Reset** button: restores the starting code |
| Hint | **Hint** button: one more hint at each click |
| Solution | "Show the solution", below the cell |

Between runs, **variables are kept** from one cell to the next within a level, like in a notebook.

## Indenting with the Tab key

Python is structured by indentation. In the editor:

- **Tab** inserts spaces (4, aligned to the next column); with several lines selected, it indents them all.
- **Shift + Tab** dedents.
- **Esc then Tab** **leaves** the code field, so keyboard navigation never gets stuck. As soon as you type in the
  editor again, Tab indents again.

## Errors

When your code crashes, PyQuest shows:

- the translated error **type** ("Python does not know this name");
- a plain-language **explanation** and a **tip**;
- the **line** concerned;
- Python's real technical message, under "Technical details", so you learn to read it.

## Reading data with `input()`

When your program calls `input("Your name? ")`, an input field appears under the output: type your answer and
validate with **Enter** or the **Send** button. The question is shown as in a real terminal.

!!! note
    Interactive input needs the page to be served with the isolation headers (see
    [Deployment](../host/deploy.md)). Without them, `input()` raises `EOFError`: that is a hosting issue, not a
    problem with your code.

## Files

Python can read and write files. In the browser, **only the `data/` folder is kept** when you close the page (for
example `open("data/agenda.txt", "w")`). Any file written elsewhere disappears on reload.

## Drawing with `canvas`

From level 13 you have a drawing sheet:

```python
import canvas

canvas.line(0, 0, 100, 0, "red")      # a red line from (0, 0) to (100, 0)
canvas.line(0, 0, 0, 100, "blue")
```

- The point `(0, 0)` is at the **centre**; positive numbers go **right** and **up**, up to 200.
- Colours: `black`, `red`, `green`, `blue`, `orange`, `purple`, `gray`.
- `canvas.clear()` wipes the sheet. **Each run starts from a blank sheet.**
- The drawing appears under the cell with a **written description** and the **list of all lines** ("See the list
  of lines"): nothing is conveyed by the image alone.
