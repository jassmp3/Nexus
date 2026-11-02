# nexus_ v5.0 — by_jass

A Tampermonkey userscript for Ticketmaster. It watches the event page, picks tickets that match your filters, and presses **Reserve Tickets** for you. When checkout is reached it plays a 3-second siren.

---

## 1. Install

1. Install the **Tampermonkey** extension in Chrome / Edge / Brave.
2. Open the Tampermonkey dashboard, then **Create a new script**.
3. Delete everything in the editor and paste the full contents of `nexus.user.js`.
4. Save (Ctrl+S).
5. Make sure only **one** nexus_ script is enabled (disable older versions).
6. Refresh your Ticketmaster tab.

To check it loaded, press F12, open the Console, and look for `[nexus_] v5.0 loaded`.

---

## 2. Show / hide the panel

| Action | How |
|---|---|
| Show or hide the panel | **Alt + Z** |
| Minimize / expand | the **–** button in the panel header |
| Move the panel | drag the header (position is shared by all tabs) |

- The panel is **hidden by default** on every new tab and appears at the **top-left** corner.
- It is **per tab**: settings, shown/hidden state and minimized state belong to that tab.
- **Refreshing** the same tab keeps your settings and keeps the panel as it was (it does not hide itself). Another tab starts hidden with its own settings.
- The bot keeps working while the panel is hidden.

---

## 3. Using it

1. Open the event page (the URL must contain `event` or `queue`).
2. Press **Alt+Z** to show the panel.
3. Set your filters (press **Enter** after each value; empty = `all`).
4. Turn the **run** switch on. The dot next to the title glows while it is running.

Other buttons:

- **sound_on / sound_off**: tick sounds for each log line (the success siren always plays).
- **↻**: reset all filters to defaults.
- **copy_mutation / paste_mutation**: copy your filters and paste them into another tab.

---

## 4. Filters

| Field | Examples | Meaning |
|---|---|---|
| `ticket_type` | pick from the list or type your own | text match; comma separate several |
| `section` | `303` · `300-309` · `306,300,309` · `-300` | exact, range, list, or `-300` = whole 100/200/300 lines |
| `row` | `1-8` · `a-f` · `-6` · `wc` | exact, range, or up to |
| `seat_number` | `4,5` · `1-15` | seat numbers allowed |
| `price` | `43` · `40-45` · `-50` | exact, range, or up to |
| `quantity` | `2` · `3,2,1` · `1-5` | biggest number is tried first |

Default quantity is `2`. Anything left as `all` is not filtered.

---

## 5. How it picks tickets

**Side panel first.** If a listing in the side panel matches your filters, it clicks it and presses Reserve.

**Map second.** If the side panel has nothing, it reads the seat map by colour:

- **Blue** = free, the only colour it ever picks.
- **Grey** = taken / nothing.
- **Red** = verified resale, always skipped.
- **Gold / star** = platinum / VIP, always skipped.

On the full map, a section that turns blue (or the section you set) is clicked. Once zoomed in, it selects seats from one row and presses Reserve. If a section has nothing usable it zooms back out and tries another.

Row, seat and section filters apply to map seats when the map labels them. If the map does not label rows or seats, those filters cannot be checked on the map.

**Never picked:** resale, verified resale, fan-to-fan, VIP, platinum, official platinum, premium.

---

## 6. Quantity rule (no lonely seat)

Ticketmaster does not allow leaving a single seat open, so nexus_ takes one extra when needed:

| You want | Free seats in the row | It takes |
|---|---|---|
| 2 | 3 | 3 |
| 3 | 4 | 4 |
| 5 | 6 | 6 |
| 2 | 4 | 2 |

---

## 7. Wheelchair / accessible seats

Blue seats with a wheelchair icon are only selected when `ticket_type` is set to one of:

- Accessible Seating
- Wheelchair Accessible
- Wheelchair Seating
- Accessible / ADA Tickets

With `ticket_type` on `all`, wheelchair seats are skipped.

---

## 8. Dialogs

If a dialog appears (single seat left open, seats not available, something went wrong, and so on), nexus_ clicks the best button it finds, in this order:

`agree & continue` → `agree` → `continue` → `ok / okay / got it` → `submit` → `accept / yes / done` → `try again / dismiss / close`

It skips sign-in, captcha and card-detail dialogs.

---

## 9. After reserving

- When the checkout or authorization page is reached, the status shows `task_complete`, the siren plays for 3 seconds and the tab title flashes `*** reserved ***`.
- After a map reserve it waits for checkout while the seats stay selected, and re-presses Reserve if needed. If the seats get released, it picks again.
- A listing that fails twice rests for 2.5 seconds, then is tried again (it never gives up).

---

## 10. Troubleshooting

| Problem | Try |
|---|---|
| Panel does not appear | Hold Alt and press Z. Check the Console for `[nexus_] v5.0 loaded`. Make sure only one nexus_ script is enabled. |
| Status says `offline_(not_on_an_event_page)` | The URL must contain `event` or `queue`. |
| Map does nothing | The map detection is based on colour and was written without access to the live page. Send the status console lines so it can be adjusted. |
| No sound | Click anywhere on the page once (browsers need a click before playing audio). |
| Panel is off-screen | Press Alt+Z twice, or drag the header back into view. |

---

Use it at your own risk and follow Ticketmaster's terms of use.
