# RimWorld AI Storyteller — notes so far
Read: 2026-10-09

## Wiki: AI Storytellers (index)
URL: https://rimworldwiki.com/wiki/AI_Storytellers
- Storyteller = main mechanism for difficulty + play style; 3 presets (Cassandra Classic, Phoebe Chillax, Randy Random); changeable mid-game.
- Event frequency/type depends on: colony wealth, building wealth, colonist count, animal count, recent colonist death/severe wounding, time since last major event.
- Difficulty adjusted separately; some storytellers less merciful.
- In-game descriptions: Cassandra = classic increasing curve of challenge/tension, dangerous events then breathing room then push again. Phoebe = lots of time between disasters to build; beware, at high difficulties hits as hard as anyone. Randy = no rules; random events; sometimes extremely difficult/unfair event groups.
- Difficulties: Peaceful / Community builder / Adventure story / Strive to survive / Blood and dust / Losing is fun. Threat scale: 10/30/60/100/155/220%. Custom difficulty editable; most values 1.0 at Strive to survive.
- Adaptation: storyteller gets more challenging when player does well. Adaptation score grows over time, knocked down when player takes damage. Two knobs: Adaptation growth rate (0-100%), Adaptation impact.
- Note: "benevolent storyteller like Phoebe will send trade caravans or helpful travelers after hitting your colony hard with a tough raid" — compensatory balancing.

## Threat points (Raid points) — from wiki Wealth management + zorrobyte/rimagent defense-basics.md (index)
- Raid points = (Wealth points + Pawn points) x Threat scale x Starting factor x Adaptation factor. 1 point buys ~1 combat power; min 35 points, cap 10,000.
- Wealth points: 0 at storyteller wealth <= 14,000; ~2,400 at 400,000 (~1 pt per 161 wealth). Storyteller wealth = items + creatures + 0.5*buildings.
- Pawn points: 15/colonist at <=10k wealth up to 140/colonist at 400k. Attack-trainable animals add 8% of combat power.
- Starting factor: 0.7 for days 0-10, 1.0 from day 40. Adaptation factor starts 0.8, 30-day grace, range 0.4-1.47.
- Threat scale: Adventure 0.60, Strive 1.00, Blood and dust 1.55, Losing is fun 2.20.
- Wealth cap for raid-point purposes: 1,000,000.

## Scheduling (from Steam discussions + wiki Randy_Random)
- Randy_Random wiki: expected interval computed from definition ~7.14 days per major threat from Randy.
- Steam discussion (Astasia): Randy uses same scaling as Phoebe/Cassandra, plus x0.5-x1.5 roll on final value. No minimum delays on incidents; averages between Cas and Phoebe on raid frequency. Cassandra can hit two major threats 1-2 days apart, then cooldown. Phoebe does one major threat, never two in a row, longer cooldown.
- One player estimate: ~1 raid/10 days Randy, ~1/6 days Cassandra alternating, ~1/16 Phoebe (rough player estimate, treat as anecdotal).
- Diseases are governed by storytellers; biome sets interval; storyteller+difficulty gate whether it can fire.
- Wealth-independent mode (custom difficulty option): time-based threat ramp instead of wealth-based.

## Still needed
- StorytellerDef XML values per storyteller (incidentIntervalDays, onDays/offDays cycles, minDaysBetweenRepeats, populationIntent, etc.) — Cassandra Classic wiki page.
- Ludeon dev blog / GDC talk on storyteller design.
