/** All user-facing strings live here (CLAUDE.md hard rule), including dev-only debug UI. */
export const strings = {
  app: {
    exitGameConfirm: "Exit game?",
  },
  ui: {
    close: "Close",
    back: "Back",
    actions: "Actions",
    stats: "Stats",
    nothing: "Nothing yet",
  },
  topBar: {
    pause: "Pause",
    menu: "Menu",
    cash: "Finance",
    stuck: (n: number) => `${n} ${n === 1 ? "train needs" : "trains need"} attention — tap to jump`,
    era: (name: string, year: number) => `Newest engine: ${name} (${year}) — open Roster`,
  },
  menu: {
    title: "Menu",
    game: "Game",
    saveGame: "Save Game",
    settings: "Settings",
    roster: "Roster",
    overlays: "Overlays",
    overlayNames: {
      catchments: "All catchments",
      cargoHeatmap: "Cargo supply heatmap",
      trackType: "Track type colors",
      trainProfit: "Train profit colors",
    },
    cargoHeatmapPrompt: "Cargo",
    miniMap: "Mini-map",
  },
  miniMap: {
    label: "Map",
  },
  toolbar: {
    track: "Track",
    double: "Double",
    electrify: "Electrify",
    station: "Station",
    bulldoze: "Bulldoze",
    info: "Info",
  },
  city: {
    tierNames: {
      village: "Village",
      town: "Town",
      city: "City",
      metropolis: "Metropolis",
    },
    growing: "Growing",
    stagnant: "Stagnant",
    civicInvestment: "Civic Investment",
    civicInvestmentDesc: "+15% population and an immediate growth tick",
    civicInvestmentCooldown: (years: number) => `Available again in ${years}y`,
    servedBy: "Served by",
    servedByNone: "No station nearby yet",
    noSupplies: "Nothing to ship",
    civicNeedsRail: "Needs a rail link",
    civicInvestmentShort: "+15% pop",
    noStationIn: (name: string) => `No station in ${name} yet`,
    growthTitle: "Growth",
    nextTier: "Next tier",
    nextTierValue: (tier: string, population: string, unlocks: string) =>
      unlocks
        ? `${tier} at ${population} — unlocks demand for ${unlocks}`
        : `${tier} at ${population} — bigger, more passengers`,
    topTier: "Largest size reached",
    growthHint: "Growth: deliver passengers, mail, food and goods. Bigger cities send more people.",
  },
  industry: {
    produces: "Produces",
    consumes: "Consumes",
    perMonth: "/mo",
    perMonthNote: "per month",
    availableFrom: "Available from",
    /** PLAN Phase 18 D: "Makes Goods from Steel or Lumber" / "Needs Coal and Iron ore". */
    makes: "Makes",
    makesFrom: "from",
    needs: "Needs",
    or: "or",
    and: "and",
    nearestSources: "Nearest sources",
    since: (year: number) => `Since ${year}`,
    kind: "Industry",
    recipeMakes: (outputs: string, inputs: string) => `Makes ${outputs} from ${inputs}`,
    recipeNeeds: (inputs: string) => `Needs ${inputs}`,
    recipeProduces: (outputs: string) => `Produces ${outputs}`,
    noSourceNearby: "None on the map yet",
    showOnMap: "Show on map",
  },
  build: {
    reasons: {
      "no-path": "Drag to draw a path first",
      blocked: "No valid route or bridge there",
      sharpTurn: "Too sharp — trains can't turn more than 45° here",
      midTileCrossing:
        "Lines can't cross mid-tile — cross at a station or a tile the other line runs through",
      junctionOnBend: "Can't join on a bend — branch off a straight stretch of the line",
      tooManyBranches: "Only one branch per side at a junction — join further along",
      junctionsTooClose: "Junctions need 2 tiles between them — join further along the line",
      "cant-afford": "Not enough cash",
      "no-track-to-upgrade": "No single track to upgrade there",
      "overhaul-not-needed": "This locomotive is too young to need an overhaul",
      "no-bridge-to-rebuild": "There is no washed-out bridge to rebuild",
      "no-track-to-relay": "That track is not worn enough to need relaying",
      "not-era-available": "Not available yet",
      "already-improved": "Already built here",
      "nothing-to-bulldoze": "No track there to bulldoze",
      "station-no-track": "Needs a straight or dead-end track tile",
      "station-occupied": "There's already a station there",
      "invalid-station": "That station doesn't exist",
      "station-in-use": "Trains still stop there — change their orders first",
      "last-engine-shed": "That's your only Engine Shed — you couldn't buy trains without it",
      "invalid-station-upgrade": "Can't upgrade to that type",
      "invalid-station-name": "Enter a name",
      "no-engine-shed": "This station has no Engine Shed",
      "invalid-locomotive": "That locomotive isn't available",
      "steam-phased-out": "Steam locomotives can't be bought after 1960",
      "too-many-cars": "Too many cars for that locomotive",
      "invalid-consist": "That consist isn't valid for this locomotive",
      "invalid-train": "That train doesn't exist",
      "invalid-orders": "Orders need 2-8 valid stations",
      "invalid-loan-amount": "Amount must be a multiple of $100k",
      "credit-limit-exceeded": "That would exceed your credit limit",
      "invalid-city": "That city doesn't exist",
      "city-not-connected": "Connect this city by rail first",
      "civic-investment-cooldown": "Civic Investment is on cooldown here",
    },
    confirmBuild: "Build",
    confirmUpgrade: "Upgrade",
    confirmElectrify: "Electrify",
    confirmBulldoze: "Bulldoze",
    stationBendWarning: (name: string) =>
      `Trains can stop at ${name} but can't run through it — the line bends too sharply there`,
    bulldozeHint: "Drag along a whole track piece",
    removeStation: "Remove",
    removeStationTitle: (name: string) => `Remove ${name}?`,
    stationInUse: (name: string, trains: string[]) =>
      `${name} is still on the orders of ${trains.join(", ")} — change their orders first`,
    bridgeWood: "Wood bridge",
    bridgeStone: "Stone bridge",
    bridgeSteel: "Steel bridge",
    tapToChangeBridge: "Tap to change bridge type",
    quickBuild: "Quick build",
  },
  station: {
    /** PLAN Phase 29 D: what a demand tile's tap says, e.g. "Accepted by: Trieste Port (export)". */
    acceptedBy: {
      text: (names: string[]) => `Accepted by: ${names.join(", ")}`,
      city: (name: string) => `${name} (city)`,
      industry: (near: string, industry: string, export_: boolean) =>
        `${near ? `${near} ` : ""}${industry}${export_ ? " (export)" : ""}`,
    },
    /** PLAN Phase 29 B: Build tab → Demolish station (two-tap confirm). */
    demolish: {
      label: (refund: string) => `Demolish station +${refund}`,
      confirm: (refund: string) => `Tap again to demolish +${refund}`,
      note: (trains: number) =>
        `${trains} ${trains === 1 ? "train stops" : "trains stop"} here — the stop is removed from ${trains === 1 ? "its" : "their"} orders. Cargo waiting here is lost; the track stays.`,
    },
    /** PLAN Phase 18 C: Warehouse transfer hub. */
    transferTitle: "Waiting for transfer",
    transferEmpty: "Warehouse: trains can leave any cargo here for another train to pick up",
    transferFrom: (cargo: string, origin: string) => `${cargo} from ${origin}`,
    unknownOrigin: "elsewhere",
    types: {
      depot: "Depot",
      station: "Station",
      terminal: "Terminal",
    },
    newStationTitle: "New Station",
    platforms: (n: number) => `${n} platforms`,
    terminalRecommended: (trains: number, platforms: number) =>
      `Terminal recommended — ${trains} trains call here but it has ${platforms} platforms`,
    type: "Type",
    tapTrackTile: "Tap a straight or dead-end track tile to place a station",
    catchment: "Catchment",
    maxTrainLength: "Max cars",
    storagePerCargo: "Storage",
    monthlyMaintenance: "Upkeep / month",
    upkeepBreakdown: (building: string, staff: number, wages: string) =>
      `${building} building + ${staff} staff (${wages} wages) a month`,
    perMonth: "/mo",
    /** PLAN Phase 16: city/station Supplies chips spell out "/ month" plus the cargo's unit word
     * (if any) instead of a bare number, so "42" reads as "42 / month" and "13" as "13 bags /
     * month" — the play-test's "I don't understand the passenger numbers" complaint. */
    supplyRate: (unit: string) => `${unit ? ` ${unit}` : ""} / month`,
    /** PLAN Phase 16: the station panel's "Waiting" line, e.g. "12 passengers waiting". */
    waitingCount: (amount: string) => `${amount} waiting`,
    supplies: "Supplies",
    perMonthNote: "per month",
    /** PLAN Phase 33: a processor in the catchment (Steel Mill …) — what it got and made last month. */
    processing: {
      title: (industry: string) => industry,
      note: "Last month's deliveries and output. Waiting stock is made at the month's end.",
      received: (list: string) => `Received last month: ${list}`,
      receivedNothing: "Received last month: nothing",
      made: (list: string) => ` → made ${list}`,
      madeNothing: " → made nothing",
      missing: (list: string) => `Missing: ${list}`,
      stock: (list: string) => `Waiting to be processed: ${list}`,
    },
    tabs: { cargo: "Cargo", trains: "Trains", build: "Build" },
    noDemands: "Accepts nothing yet",
    noSupplies: "Nothing to ship yet",
    accepts: "Demands",
    engineShedFree: "Free Engine Shed",
    engineShedBuilt: "Engine Shed",
    buildEngineShed: "Build Engine Shed",
    waterTowerBuilt: "Water Tower",
    buildWaterTower: "Build Water Tower",
    rename: "Name",
    upgradeToPrefix: "Upgrade to ",
    build: "Build",
    improvements: "Improvements",
    improvementNames: {
      postOffice: "Post Office",
      hotel: "Hotel",
      warehouse: "Warehouse",
      coldStorage: "Cold Storage",
      freightYard: "Freight Yard",
      livestockPens: "Livestock Pens",
    },
    improvementAvailableFrom: (year: number) => `Available from ${year}`,
    /** PLAN Phase 26B: one-line benefit under each improvement tile in the Build tab. */
    improvementBenefit: {
      postOffice: "Mail +50% here",
      hotel: "Passengers pay +25% here; the town grows faster",
      warehouse: "2× storage; waiting cargo doesn't spoil; trains can hand cargo over",
      coldStorage: "Food & livestock keep fresh here; +15% pay",
      freightYard: "Trains load and unload 2× faster",
      livestockPens: "Needed to load livestock here",
    },
    results: {
      title: "Results here",
      none: "No fares from this station yet — run a train that loads here.",
      revenue: "Revenue",
      turnedAwayCaption: "Turned away",
      lostFares: "Lost fares",
      turnedAway: (n: number, fares: string) => `${n} gave up waiting · ${fares} lost`,
      noneLost: "Nobody turned away",
      lastMonthNote: "Last month. Fares of cargo loaded here, paid when it is delivered.",
      thisMonthNote: "This month so far. Fares of cargo loaded here, paid when it is delivered.",
    },
    estimate: (money: string) => `≈ +${money}/yr at current traffic`,
    waterTowerBenefit: "Steam engines refill water here",
    engineShedBenefit:
      "Buy and service trains here (breakdowns −50%); repair crews start from the nearest shed — more sheds, shorter call-outs",
    /** "Why?" hints shown under a tile when the improvement would (not) help right now. */
    why: {
      needsCity: "No town or city in range",
      ranchInRange: "A livestock ranch is in range",
      noRanch: "No livestock ranch in range yet",
      foodInRange: "Food or livestock is produced in range",
      noFood: "No food or livestock in range yet",
    },
    /** Station type upgrade card: what the next type adds. */
    upgradeBenefit: (side: number, platforms: number, faster: number, cars: number) =>
      `Catchment ${side}×${side} · ${platforms} platforms · ${faster > 0 ? `loads ${faster}% faster` : "standard loading"} · up to ${cars} cars`,
  },
  trains: {
    buyTitle: "Buy Train",
    locomotive: "Locomotive",
    cars: "Cars",
    orders: "Orders",
    buy: "Buy",
    sell: "Sell",
    sellConfirm: "Tap again to sell",
    sellFor: (refund: string) => `Sell +${refund}?`,
    status: "Status",
    speed: "Speed",
    consist: "Consist",
    empty: "Empty",
    none: "No trains yet.",
    listTitle: "Trains",
    addStop: "+ Add stop (tap a station)",
    tapAStation: "Tap a station on the map…",
    trainsButton: "Trains",
    newBadge: "New!",
    locoTypes: {
      steam: "Steam",
      diesel: "Diesel",
      electric: "Electric",
    },
    statusNames: {
      loading: "Loading",
      moving: "Moving",
      waitingForBlock: "Waiting for the line",
      waitingForStation: "Waiting for a platform",
      noRoute: "No route",
      stuck: "Stuck",
      broken: "Broken down",
    },
    loadingRules: {
      auto: "Auto",
      fullLoad: "Full load",
      unloadOnly: "Unload only",
      passThrough: "Pass through",
      /** Unload everything into the Warehouse's transfer stock (PLAN Phase 18 C). */
      transfer: "Unload all (transfer)",
    },
    routeNotElectrified: "Route not electrified",
    /** Repair crews (Phase 26A). */
    repairArriving: (station: string, days: number) =>
      `Broken down — repair crew from ${station} arriving in ${days} ${days === 1 ? "day" : "days"}`,
    repairArrivingFar: (station: string, days: number) =>
      `Broken down — no Engine Shed, slow crew from ${station} arriving in ${days} ${days === 1 ? "day" : "days"}`,
    repairing: (days: number) =>
      `Repair crew at work — back on the line in ${days} ${days === 1 ? "day" : "days"}`,
    /** SPEC §7.5: "the train panel says what they are waiting for." Only shown while `status` is
     * `waitingForBlock`/`waitingForStation` and the train has an actual target to name — falls
     * back to the plain `statusNames` label otherwise (e.g. right after a reroute attempt, before
     * a fresh target is known). */
    /** PLAN Phase 29 D: a train queued in a station's yard says how many are ahead of it. */
    waitingInYard: (station: string, ahead: number) =>
      `Waiting in the yard for a platform at ${station}${ahead > 0 ? ` (${ahead} ahead)` : ""}`,
    waitingForLineClear: (station: string) => `Waiting for line clear to ${station}`,
    waitingForPlatform: (station: string) => `Waiting in the yard at ${station} for a platform`,
    /** PLAN Phase 18 B: the panel names the blocker, not just the destination. */
    waitingForTrainOnLine: (trains: string, station: string) =>
      `Waiting for ${trains} (single track to ${station})`,
    waitingForTrainAtPlatform: (station: string, trains: string) =>
      `Waiting in the yard at ${station} for a platform (${trains})`,
    /** PLAN Phase 25A: halted just short of a junction/crossing another train is using. */
    waitingAtCrossing: (trains: string) => `Waiting at crossing for ${trains}`,
    /** Floating label for cargo left at a Warehouse hub (no payment yet). */
    transferred: "Transferred",
    /** Merged floating delivery label ("+$1.9k · 3 deliveries"). */
    deliveriesMerged: (n: number) => `${n} deliveries`,
    /** PLAN Phase 33: a car whose cargo no stop of the route accepts never loads. */
    cargoGap: {
      text: (cargo: string, cars: number) =>
        `No stop on this route accepts ${cargo} — the ${cars === 1 ? "car" : `${cars} cars`} will stay empty`,
      nearest: (names: string[]) => `Nearest that accept it: ${names.join(", ")}`,
      buildBeside: (name: string) => `${name} (build a station beside it)`,
    },
    undeliverableChip: (cars: number, cargo: string) =>
      `${cars} ${cars === 1 ? "car" : "cars"} of ${cargo} can't be delivered on this route`,
    noRouteTo: (station: string) => `No route to ${station}`,
    editCars: "Edit cars",
    editCarsTitle: "Edit Consist",
    /** PLAN Phase 15: shown while `train.pendingConsist` is set (the train isn't at a station right
     * now, so the change waits for its next stop). */
    consistChangeQueued: "Changes apply at next station",
    confirm: "Confirm",
    replace: "Replace",
    replaceTitle: "Replace Locomotive",
    tradeInCredit: "Trade-in credit",
    replaceUnavailable: "Cannot pull this train",
    listSubtitle: (n: number) => (n === 1 ? "1 train" : `${n} trains`),
    /** Buy-train wizard (STYLE §11.1). */
    wizard: {
      title: (station: string) => `Buy train · ${station}`,
      steps: { engine: "Engine", cars: "Cars", route: "Route" },
      next: "Next",
      back: "Back",
      stepOf: (n: number, total: number, name: string) => `Step ${n} of ${total} · ${name}`,
      filterAll: "All",
      needsElectrification: "Needs electrified track at this station",
      steamRetired: "Steam can no longer be bought",
      chooseEngine: "Choose an engine",
      introduced: (year: number) => `Since ${year}`,
      carsUsed: (used: number, max: number) => `${used} / ${max} cars`,
      passengerMailOnly: "Passenger and mail cars only",
      noCarsYet: "No cars yet — tap a car below to add it",
      tapToRemove: "Tap a car to remove it",
      suggested: "Suggested",
      applySuggestion: "Use",
      suggestPassengers: "Passengers + mail",
      suggestFreight: (cargo: string) => `${cargo} train`,
      addCar: (name: string) => `Add ${name} car`,
      removeCar: (name: string) => `Remove ${name} car`,
      clear: "Clear",
      stopsHint: "Add at least two stops",
      tapOnMap: "Tap on map",
      fromList: "From list",
      addFromListTitle: "Add a stop",
      searchStations: "Search stations",
      noStationsFound: "No station matches",
      cash: "Cash",
      short: (amount: string) => `Short ${amount}`,
      borrow: (amount: string) => `Borrow ${amount}`,
      creditMaxed: "Credit limit reached",
      cantAfford: "Can't afford",
      longerRoutesHint:
        "Longer routes pay more per trip and load less often, so a fast engine earns more on them.",
      longerRoutesHintSlow:
        "Slow engines lose the speed bonus on long routes — keep this one to short lines.",
      stopCount: (n: number) => `${n} / 8 stops`,
      yourTrain: "Your train",
    },
    list: {
      sortName: "Name",
      sortProfit: "Profit",
      sortLines: "Lines",
      perYear: "/yr",
      losing: "Losing money",
      noLines: "No lines yet — a line is trains that share the same stops.",
      lineTrains: (n: number) => (n === 1 ? "1 train" : `${n} trains`),
      lineRevenue: "Revenue",
      lineCosts: "Costs",
    },
    stats: {
      speed: "Top speed",
      power: "Power",
      maxCars: "Max cars",
      reliability: "Reliability",
      price: "Price",
      running: "Running cost",
      perYear: "/yr",
    },
    /** Train panel v2 (STYLE §11.2). */
    panel: {
      tabs: { route: "Route", stats: "Stats" },
      subtitle: (loco: string) => loco,
      moving: (station: string, speed: string) => `To ${station} · ${speed}`,
      loadingAt: (station: string, pct: number) => `Loading at ${station} · ${pct}%`,
      atStop: (station: string) => `At ${station}`,
      hereNow: "Here now",
      nextStop: "Next stop",
      addStop: "Add stop",
      passedNote: (from: string) =>
        `Passed without stopping on the way from ${from} — add it again after ${from} to stop both ways`,
      addStopHere: "Add stop here",
      doneAdding: "Done",
      removeStop: "Remove stop",
      moveUp: "Move up",
      moveDown: "Move down",
      changeRule: "Change loading rule",
      earned: "Earned",
      profitThisYear: "Profit this year",
      profitLastYear: "Last year",
      profitLifetime: "Lifetime",
      paidBack: (pct: number, price: string) => `Paid back ${pct}% of ${price}`,
      runningCost: "Fuel & servicing",
      crewOf: (n: number) => `Crew of ${n}`,
      wagesPerYear: "Wages",
      trackWearThisYear: "Track wear",
      repairsThisYear: "Repairs",
      breakdownCallOut: (total: string, wages: string, parts: string) =>
        `Call-out ${total} (crew ${wages}, parts ${parts})`,
      competitionLoss: (pct: number) =>
        `Buses, lorries and airlines take ${pct}% of this route's fares`,
      capacity: "Capacity",
      load: "Load",
      noCars: "No cars",
      loadedOf: (loaded: number, cap: number) => `${loaded} / ${cap} loaded`,
      breakdownChance: (pct: string) => `${pct}% / month breakdown risk`,
      age: "Age",
      ageYears: (n: number) => (n < 1 ? "< 1 yr" : `${n} yr`),
      reliability: "Reliability",
      stopsNeeded: "A train needs at least two stops",
    },
    rulePickerTitle: "Loading at this stop",
    ruleHint: {
      auto: "Load what is waiting, then go",
      fullLoad: "Wait until every car is full",
      unloadOnly: "Drop cargo, take nothing",
      passThrough: "Roll through without stopping",
      transfer: "Unload into the warehouse",
    },
  },
  /** Short, factual, original notes for the Roster (STYLE §11.3), by locomotive id. */
  locoNotes: {
    "grasshopper-0-4-0":
      "A tiny four-wheeled yard engine with vertical cylinders and a walking-beam drive. Slow and light, it proved that rails could carry paying loads.",
    "planet-2-2-0":
      "Cylinders tucked inside the frame and a single big driving axle made this a smooth, steady runner, and the pattern many early builders copied.",
    "norris-4-2-0":
      "A four-wheel leading truck let this single-driver engine follow sharp, roughly laid curves, opening up hilly country to steam.",
    "american-4-4-0":
      "The 4-4-0 hauled most of the continent's trains in the mid-1800s: four guiding wheels for curves, four drivers for speed.",
    "mogul-2-6-0":
      "Six small drivers gave the Mogul the grip to pull long freight strings up grades where the faster passenger engines slipped.",
    "consolidation-2-8-0":
      "Eight coupled drivers made it the workhorse of heavy freight for half a century: slow, sure-footed and hard to stall.",
    "ten-wheeler-4-6-0":
      "Adding a sixth driver to the American gave more pull at speed, and it became the standard all-round engine of the 1880s.",
    "atlantic-4-4-2":
      "Two large driving wheels and a wide firebox under the cab made it fast, and it reigned on the fastest schedules of its day.",
    "pacific-4-6-2":
      "The trailing truck allowed a big firebox, so the Pacific could sustain high speed with heavy trains. It defined express steam for a generation.",
    "mikado-2-8-2":
      "A trailing truck let the Consolidation's grip be joined to a large firebox, giving the freight engine plenty of steam for long hauls.",
    "hudson-4-6-4":
      "Four-wheel leading and trailing trucks carried a huge boiler at high speed, the last word in fast steam passenger power.",
    "articulated-4-8-8-4":
      "Two sets of eight drivers hinged under a single very long boiler. It was built for the heaviest mountain freight, and it looks the part.",
    "early-electric":
      "Drawing current from an overhead wire or third rail, it needed no smoke or water stops and made tunnels and city approaches far cleaner.",
    "streamliner-diesel":
      "A smooth, wind-cheating nose and a diesel-electric drive gave the 1930s a train that looked like the future and ran like it.",
    "e-unit-electric":
      "A long, smooth-sided electric with an overhead pantograph: quiet, fast and capable of hauling the longest express trains.",
    "cab-unit-diesel":
      "Boxy, streamlined and built to be coupled in sets, the cab unit took over passenger and freight work as steam faded from main lines.",
    "road-switcher-diesel":
      "One short hood with a cab at the end, good to see forward and back. It could shunt in the yard and run the line the same day.",
    "modern-electric":
      "Solid-state controls and a single-arm pantograph give quick acceleration and strong braking, which suits busy suburban timetables.",
    "high-horsepower-diesel":
      "More engine in the same frame: the extra power lets a single locomotive replace a pair on long, heavy freights.",
    "heavy-diesel":
      "A wide-nosed, six-axle diesel built for the heaviest unit trains, prized for steady pulling power rather than top speed.",
    "high-speed-trainset":
      "A fixed set with a wedge nose, powered along its length and built for passengers only. Nothing else on the roster is as fast.",
    "heavy-freight-electric":
      "Wire-fed power and a low centre of gravity: the strongest engine on the roster, made to move mountains of freight.",
  } as Record<string, string>,
  roster: {
    title: "Engine shed",
    subtitle: (owned: number, known: number, total: number) =>
      `${known} of ${total} models known · ${owned} in service`,
    lanes: { steam: "Steam", diesel: "Diesel", electric: "Electric" },
    future: "Not yet built",
    available: "Available",
    retired: "No longer built",
    owned: (n: number) => (n === 0 ? "None in service" : `${n} in service`),
    wheels: "Wheel arrangement",
    introduced: "Introduced",
    detailBack: "Back to roster",
  },
  newEngine: {
    overline: "New locomotive",
    overlineMany: (n: number) => `${n} new locomotives`,
    cars: "cars",
    roster: "Roster",
    ok: "OK",
    year: (y: number) => `${y}`,
  },
  finance: {
    title: "Finance",
    subtitle: "Company accounts",
    tabs: { overview: "Overview", year: "This year" },
    noneYet: "Nothing yet",
    cash: "Cash",
    loans: "Loans",
    creditLimit: "Credit",
    borrow: "Borrow",
    repay: "Repay",
    borrowTip: "Borrow $100k",
    repayTip: "Repay $100k",
    creditNote: "Loans come in $100k steps",
    netWorth: "Net worth",
    thisYear: "This year",
    lastYear: "Last year",
    revenue: "Revenue",
    passengers: "Passengers",
    mail: "Mail",
    freight: "Freight",
    expenses: "Expenses",
    trainMaintenance: "Fuel & servicing",
    crewWages: "Crew wages",
    trackMaintenance: "Track upkeep",
    trackWear: "Track wear",
    stationMaintenance: "Stations & staff",
    propertyTax: "Property tax",
    incomeTax: "Income tax (provisional)",
    breakdownRepairs: "Repairs",
    /** Economic model v2: what each cost line is (shown on hover / in Help). */
    costNotes: {
      trainMaintenance: "Coal, oil, water and depot servicing for every locomotive",
      crewWages:
        "Drivers, firemen and guards — bigger trains need bigger crews, and wages rise faster than prices",
      trackMaintenance:
        "Platelayers' wages plus ballast, sleepers and rail for every tile; double track and catenary cost more",
      trackWear: "Rail wear caused by the trains that ran: heavy, fast, loaded trains wear it most",
      stationMaintenance: "Building upkeep plus the station staff's wages",
      propertyTax: "Local tax on the book value of your track, stations and improvements",
      incomeTax:
        "Corporate tax on the year's operating profit (from the 1910s; losses carry forward). Set aside every month and settled at the year's end",
      breakdownRepairs:
        "Repair crews' wages for the distance driven from the nearest Engine Shed, plus parts",
    },
    interest: "Interest",
    construction: "Construction",
    rollingStock: "Rolling stock",
    netProfit: "Net profit",
    operatingProfit: "Operating profit",
    perMonth: "/ month",
    operatingIncome: "Income",
    operatingCosts: "Running costs",
    avg12: (months: number) => (months >= 12 ? "12-month average" : `${months}-month average`),
    last30: "Last 30 days",
    investments: "Investments",
    investmentsNote: "track, stations, trains — not in operating profit",
    investmentLabel: (label: string) => `${label} (investment)`,
    chartTitle: "Cash & net worth",
    chartCash: "Cash",
    chartNetWorth: "Net worth",
    yearlyReport: "Yearly Report",
    bankruptWarning: "Cash has been negative for months — borrow, sell trains, or cut costs.",
  },
  yearlyReport: {
    title: (year: number) => `${year} Year in Review`,
    close: "Close",
    newTechnology: "New technology",
    toast: (year: number) => `${year} Year in Review is ready — open it from Finance`,
  },
  help: {
    menuEntry: "Help",
    title: "Help",
    tabs: { upgrades: "Stations", money: "Money", lines: "Lines", upkeep: "Upkeep" },
    upgrades: {
      typesTitle: "Station size",
      typesIntro: "Bigger stations reach further and handle more trains.",
      improvementsTitle: "Improvements",
    },
    money: {
      title: "How money works",
      lines: [
        { icon: "coin", text: "You earn money when a train unloads cargo where it is wanted." },
        {
          icon: "trendUp",
          text: "Pay grows with distance and speed: longer, faster trips earn more.",
        },
        {
          icon: "cargo",
          text: "Freight pays per ton; passengers and mail need towns at both ends.",
        },
        {
          icon: "city",
          text: "Towns that get good service grow — bigger towns send more passengers and want more goods.",
        },
        {
          icon: "wrench",
          text: "Fuel, crew wages, track upkeep and wear, and station staff cost money every month. Wages rise faster than prices, and heavy, fast trains wear the track most.",
        },
        {
          icon: "wrench",
          text: "A breakdown sends a repair crew from the nearest Engine Shed — the farther it drives, the longer the train waits and the more the call-out costs. Build sheds near the ends of long lines.",
        },
        {
          icon: "anchor",
          text: "A Port accepts all bulk freight — coal, ore, wood, grain, livestock, oil, steel, lumber, food and fuel — for export. A station next to one shows those demands with an anchor badge; tap a demand to see who accepts it.",
        },
        {
          icon: "coin",
          text: "Property tax is charged on everything you build. From the 1910s the company pays income tax on its profit, and the rate climbs through the century.",
        },
        {
          icon: "trendUp",
          text: "Fares fall in real terms as rail becomes mass transit. From the 1920s buses, lorries and airlines take short trips and short-haul freight; long, fast and bulk traffic keeps its share.",
        },
        {
          icon: "finance",
          text: "Short of cash? Take a loan from Finance — but interest is charged monthly.",
        },
      ],
    },
  },
  /** Help pages added in Phase 30B (Playtest 2: "the Help says nothing about waiting piles, single track, ...").
   * Wording for the 30A mechanisms follows their PLAN/SPEC descriptions. */
  helpMore: {
    linesTitle: "Running a line",
    upkeepTitle: "Upkeep and capital",
    lines: [
      {
        icon: "town",
        text: "Waiting passengers and mail are people: the longer they wait, the more give up and go by road or stay home. Frequent trains keep them. A station's panel shows how many it turned away and the fares lost.",
      },
      {
        icon: "trains",
        text: "Frequency pays: more trains on a busy pair mean shorter waits and more fares — until the line is full. Warehouses store freight only; they do not make passengers wait longer.",
      },
      {
        icon: "track",
        text: "On single track trains can only pass at stations. Several trains on one line end up waiting for each other, and income can fall as you add trains.",
      },
      {
        icon: "swap",
        text: "A passing loop is a short double section on single track where two trains can meet. It is cheap, and spaced departures let three or four trains share one line.",
      },
      {
        icon: "doubleTrack",
        text: "Double track lets trains run both ways at once: the fix for a busy line. Build it on the stretch where trains queue.",
      },
      {
        icon: "waterTower",
        text: (km: number): string =>
          `A steam locomotive needs water. Run more than about ${km} km without a Water Tower and it loses 20% of its speed. Put a tower at a station on long lines.`,
      },
      {
        icon: "finance",
        text: "A line is the trains that share the same stops. Open Trains and tap Lines to see each line's revenue, costs and profit a year, and drop the ones that lose money.",
      },
      {
        icon: "cargo",
        text: "“Wait for full load” holds a train until every car is full. It suits freight at a mine; on a passenger line it can leave the track idle.",
      },
      {
        icon: "warning",
        text: "Wooden bridges wash out now and then, and a heavy engine cannot cross one. A washed-out bridge cuts the line, with a marker on the map, until you rebuild it in wood, stone or steel.",
      },
    ],
    upkeep: [
      {
        icon: "wrench",
        text: "Track wears with tonnage and speed. Worn track gets slow orders until you relay it for a cost per tile. Light early traffic barely wears; heavy, fast late traffic needs relaying every couple of decades.",
      },
      {
        icon: "clock",
        text: "Locomotives age: after 15 years running cost and breakdowns creep up. A steam engine is worn out at about 35 years, a diesel at 40, an electric at 45 — then overhaul it in the shed or replace it.",
      },
      {
        icon: "city",
        text: "Land costs money: track and stations cost more near big cities than in open country, and land gets dearer with the years. The build preview shows land as its own line.",
      },
      {
        icon: "finance",
        text: "Loans come in $100k steps from Finance. The more you owe against what the company is worth, the higher the interest rate; your credit limit follows your earnings.",
      },
      {
        icon: "coin",
        text: "Income tax is set aside every month as provisional tax, so there is no surprise at year end. Finance shows it as its own line.",
      },
      {
        icon: "trendUp",
        text: "Upgrade cards show an estimated gain per year at your current traffic. It is an estimate: check the station's Results and the Lines view afterwards.",
      },
    ],
  },
  /** Wording used when a name lookup fails (a sold train, a bulldozed station, an empty map): text never
   * shows a bare "?" (PLAN Phase 27 D). */
  fallback: {
    train: "a train",
    station: "a station",
    city: "a nearby town",
    place: "the line",
    locomotive: "a new locomotive",
    goal: "a goal",
  },
  news: {
    title: "News",
    button: "News",
    empty: "No news yet.",
    clearAll: "Clear all",
    clearAllConfirm: "Clear all news?",
    times: (n: number) => `×${n}`,
    kinds: {
      newLocomotive: (locoName: string) => `New locomotive available: ${locoName}`,
      breakdown: (trainName: string) => `${trainName} has broken down and is being repaired`,
      washout: (nearName: string) => `A wooden bridge near ${nearName} has washed out`,
      locoWornOut: (trainName: string) =>
        `${trainName}'s locomotive is worn out — overhaul or replace it before it fails again`,
      slowOrders: (n: number, nearName: string) =>
        `Worn track: slow orders on ${n} ${n === 1 ? "section" : "sections"}, worst near ${nearName} — relay it`,
      trafficJam: (nearName: string) =>
        `Traffic jam near ${nearName} — consider double track or more stations`,
      /** A jam where the sim can count the trains involved (Phase 30B). */
      trafficJamSingle: (n: number, nearName: string) =>
        `${n} trains share a single line near ${nearName} — add a passing loop or double track`,
      trafficJamBusy: (n: number, nearName: string) =>
        `${n} trains queue near ${nearName} — add platforms, a second station or another line`,
      noRoute: (trainName: string, stationName: string) =>
        `${trainName} has no route to ${stationName}`,
      undeliverable: (trainName: string, cars: number, cargo: string) =>
        `${trainName} carries ${cars} ${cars === 1 ? "car" : "cars"} of ${cargo} that no stop on its route accepts`,
      stationDemolished: (name: string, trains: number) =>
        trains === 0
          ? `${name} was demolished`
          : `${name} was demolished — removed from the orders of ${trains} ${trains === 1 ? "train" : "trains"}`,
      cityGrowth: (cityName: string, tierName: string) =>
        `${cityName} has grown into a ${tierName}!`,
      civicInvestment: (cityName: string) => `Civic Investment boosts growth in ${cityName}`,
      cityFounded: (cityName: string) => `${cityName} has been founded!`,
      discovery: (cargo: string, nearName: string) => `${cargo} discovered near ${nearName}`,
      goalCompleted: (tierName: string, description: string, grant?: string) =>
        `${tierName} goal reached: ${description}${grant ? ` — ${grant} land grant` : ""}`,
      /** Economic model v2: other transport arrives (docs/SPEC.md §9). */
      competition: {
        road: "Motor buses now compete on short routes — short passenger and mail trips lose fares",
        truck: "Motor lorries now compete for short-haul freight — bulk cargo is less affected",
        air: "Airlines now compete for long-distance passengers — fast trains keep more of them",
      },
    },
  },
  goals: {
    title: "Goals",
    button: "Goals",
    tierNames: {
      bronze: "Bronze",
      silver: "Silver",
      gold: "Gold",
    },
    complete: "Complete",
    overdue: "Overdue",
    /** Phase 30A: a goal pays in land (credit against land and way-leave bills). */
    reward: (amount: string) => `Reward: ${amount} land grant`,
    rewardReceived: "Land grant received",
    byYear: (year: number) => `By ${year}`,
    none: "This map has no goals.",
    doneCount: (done: number, total: number) => `${done} of ${total} reached`,
    types: {
      connect: (cities: string) => `Connect ${cities} by rail`,
      annualRevenue: (amount: string) => `Annual revenue ${amount}`,
      netWorth: (amount: string) => `Net worth ${amount}`,
      cityTier: (city: string, tier: string) => `${city} reaches ${tier}`,
      delivered: (amount: number, cargo: string) =>
        `Deliver ${amount} carloads of ${cargo} in a year`,
      electrifiedTiles: (n: number) => `Electrify ${n} tiles`,
    },
  },
  celebration: {
    title: "Goal reached!",
    close: "Continue",
  },
  titleScreen: {
    gameTitle: "Railroads",
    newGame: "New Game",
    continue: "Continue",
    loadGame: "Load Game",
    settings: "Settings",
  },
  settings: {
    title: "Settings",
    groupPlay: "Gameplay",
    groupDisplay: "Display & sound",
    units: "Speed units",
    unitsNames: { kmh: "km/h", mph: "mph" },
    quickBuild: "Quick build",
    quickBuildDesc: "Skip the confirm bar — releasing a drag builds immediately",
    sound: "Sound",
    soundDesc: "Whistle, chug and cash-register sound effects",
    grid: "Show tile grid",
    uiScale: "UI scale",
    uiScaleNames: { "0.85": "Small", "1": "Normal", "1.15": "Large" },
  },
  saveLoad: {
    loadTitle: "Load Game",
    saveTitle: "Save Game",
    autosaveLabel: (n: number) => `Autosave ${n}`,
    emptySlot: "Empty slot",
    load: "Load",
    save: "Save",
    overwrite: "Overwrite",
    delete: "Delete",
    deleteConfirm: "Delete this save?",
    oldMapScale: "This save uses the old map scale and can't be loaded",
    namePrompt: "Save name",
    nameDefault: "My Game",
  },
  hints: {
    steps: [
      "Drag on the map with the Track tool to lay your first line.",
      "Tap Station on a straight piece of track or a dead end to build a station.",
      "Buy a train at a station with an Engine Shed (the first station you build gets one free).",
      "Set orders — tap stations on the map — then watch the cash roll in as it delivers cargo.",
    ] as string[],
    hardMoney:
      "Hard: keep enough cash for the locomotive before you lay track. Short? Borrow in Finance (tap the cash).",
    earlyEngines: (loco: { name: string; introYear: number }): string =>
      `Early engines are weak and slow. The ${loco.name} arrives in ${loco.introYear}: until then keep lines short.`,
    next: "Got it",
    done: "Start playing",
    skip: "Skip tips",
  },
  newGame: {
    title: "New Game",
    tabRealWorld: "Real World",
    tabRandom: "Random",
    startYear: "Start year",
    difficulty: "Difficulty",
    difficultyNames: {
      easy: "Easy",
      normal: "Normal",
      hard: "Hard",
    },
    startingCash: "Starting cash",
    start: "Start Game",
    seed: "Seed",
    randomizeSeed: "Randomize seed",
    size: "Map size",
    sizeNames: {
      small: "Small",
      medium: "Medium",
      large: "Large",
    },
    waterLevel: "Water level",
    waterLevelNames: {
      low: "Low",
      normal: "Normal",
      high: "High",
    },
    roughness: "Terrain",
    roughnessNames: {
      flat: "Flat",
      normal: "Normal",
      mountainous: "Mountainous",
    },
    cityCount: "Cities",
    cityCountNames: {
      few: "Few",
      normal: "Normal",
      many: "Many",
    },
    resourceDensity: "Resources",
    resourceDensityNames: {
      low: "Low",
      normal: "Normal",
      high: "High",
    },
    regionDescriptions: {
      "us-east": "Coastlines, the Appalachians, and the industrial Northeast.",
      gb: "London to Glasgow — Great Britain's first railway age.",
      "central-eu": "The Alps divide Italy from Germany and Austria.",
      "us-west": "Deserts, the Rockies, and the Pacific coast.",
    } as Record<string, string>,
  },
  debug: {
    regenerate: "New seed",
    seedLabel: "Seed",
    sizeLabel: "Size",
    sizeSmall: "Small",
    sizeMedium: "Medium",
    sizeLarge: "Large",
  },
  errorBoundary: {
    title: "Something went wrong",
    body: "Railroads hit an unexpected error. Your progress has been saved to a recovery slot — reload and use Load Game to pick it up.",
    reload: "Save & Reload",
  },
};
