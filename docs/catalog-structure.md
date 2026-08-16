# Catalog Structure — Categories and Attributes

The concrete category tree and per-category attribute definitions for all eight launch
categories. This is open question 3 of
[decision 0001](decisions/0001-category-tree-and-attributes.md), and it is what a seeder
consumes to populate `category`, `attribute` and `attribute_value_option`.

Read alongside [catalog-entity-model.md](catalog-entity-model.md) for the table design.

**Legend** — `V` = `is_variant_defining` (splits into separate `master_product` rows),
`F` = `is_searchable_filter`. Attributes listed under a **non-leaf** category are declared
there and **inherited** by every descendant, per decision 0001.

> **Three findings from doing this work contradict the current docs.** They are listed in
> [Findings](#findings-requiring-a-decision) at the end and are *not* yet reflected in the
> tables below. Read them before seeding anything.

---

## 0. Global attributes

Declared once, applied to every product in every category.

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Warranty Period | number | months | ✗ | ✗ | — |
| Certification Mark | enum | — | ✗ | ✓ | ISI, BIS, CE, ISO, None |

There is no single root category to hang these on — see finding 1.

**Country of Origin is deliberately not here.** It is a `master_product` column, because
Legal Metrology requires it on every listing as a searchable, sortable filter —
`NOT NULL` guarantees that; an attribute would not
([0010](decisions/0010-indian-compliance-fields.md)).

---

## 1. Electrical

No attributes declared at level 1; nothing is genuinely shared across wires, fans and
conduits beyond the global set.

### 1.1 Wires & Cables — `electrical/wires-cables` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Cable Type | enum | — | ✓ | ✓ | House Wire (FR), House Wire (FRLS), Flexible Cable, Armoured Cable, Submersible Cable, Coaxial, LAN |
| Conductor Size | number | sq mm | ✓ | ✓ | 0.75, 1.0, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50 |
| Number of Cores | number | — | ✓ | ✓ | 1, 2, 3, 4 |
| Conductor Material | enum | — | ✓ | ✓ | Copper, Aluminium |
| Insulation | enum | — | ✗ | ✓ | PVC, XLPE, FR, FRLS, HRFR |
| Voltage Grade | enum | V | ✗ | ✗ | 650, 1100 |

Coil length is packaging, not spec → `pack_content_qty` (see finding 2). Wire may be
`sale_unit_type = 'cut_to_length'`.

### 1.2 Switches & Sockets — `electrical/switches-sockets` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Device Type | enum | — | ✓ | ✓ | One-way Switch, Two-way Switch, Bell Push, Socket 6A, Socket 16A, Combined 6/16A, Fan Regulator, Dimmer, USB Socket |
| Module Size | number | modules | ✓ | ✓ | 1, 2, 3, 4, 6 |
| Current Rating | number | A | ✓ | ✓ | 6, 10, 16, 20, 25 |
| Series | text | — | ✓ | ✓ | — |
| Finish | enum | — | ✓ | ✓ | White, Ivory, Black, Silver, Gold, Wood |

### 1.3 Switch Plates & Frames — `electrical/switch-plates` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Module Capacity | number | modules | ✓ | ✓ | 1, 2, 3, 4, 6, 8, 12, 18 |
| Material | enum | — | ✓ | ✓ | Polycarbonate, ABS, Metal, Glass, Wood |
| Finish | enum | — | ✓ | ✓ | White, Ivory, Black, Silver, Gold, Wood |
| Series | text | — | ✓ | ✓ | — |

### 1.4 Conduits & Accessories — `electrical/conduits` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Product Type | enum | — | ✓ | ✓ | Rigid Conduit, Flexible Conduit, Bend, Coupler, Junction Box, Saddle |
| Diameter | number | mm | ✓ | ✓ | 20, 25, 32, 40, 50 |
| Material | enum | — | ✓ | ✓ | PVC, HDPE, GI |
| Duty Grade | enum | — | ✓ | ✓ | Light, Medium, Heavy |

### 1.5 Fans — `electrical/fans` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Fan Type | enum | — | ✓ | ✓ | Ceiling, Exhaust, Wall, Pedestal, Table, Tower |
| Sweep Size | number | mm | ✓ | ✓ | 600, 900, 1200, 1400 |
| Motor Type | enum | — | ✓ | ✓ | Induction, BLDC |
| Power Consumption | number | W | ✗ | ✓ | — |
| Star Rating | enum | — | ✗ | ✓ | 1, 2, 3, 4, 5 |
| Blade Count | number | — | ✗ | ✗ | — |
| Speed | number | RPM | ✗ | ✗ | — |
| Finish | text | — | ✓ | ✓ | — |

### 1.6 LED Bulbs & Tubes — `electrical/led-bulbs-tubes` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Lamp Type | enum | — | ✓ | ✓ | LED Bulb, LED Tube, LED Panel, LED Downlighter, LED Strip, LED Batten |
| Wattage | number | W | ✓ | ✓ | 3, 5, 7, 9, 12, 15, 18, 20, 22, 36 |
| Cap / Base Type | enum | — | ✓ | ✓ | B22, E27, E14, G9, GU10, T5, T8 |
| Colour Temperature | enum | K | ✓ | ✓ | Warm White 2700K, Neutral 4000K, Cool Daylight 6500K |
| Luminous Flux | number | lm | ✗ | ✗ | — |
| Dimmable | boolean | — | ✗ | ✓ | — |

### 1.7 Switchgear — `electrical/switchgear` · **non-leaf**

Declared here, inherited by all four leaves below — the clearest inheritance win in
Electrical:

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Number of Poles | enum | — | ✓ | ✓ | SP, SPN, DP, TP, TPN, FP |
| Breaking Capacity | number | kA | ✗ | ✓ | 3, 6, 10 |
| Mounting | enum | — | ✗ | ✗ | DIN Rail, Surface, Flush |

#### 1.7.1 MCB — `electrical/switchgear/mcb` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Rated Current | number | A | ✓ | ✓ | 6, 10, 16, 20, 25, 32, 40, 50, 63 |
| Tripping Curve | enum | — | ✓ | ✓ | B, C, D |

#### 1.7.2 RCCB — `electrical/switchgear/rccb` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Sensitivity | number | mA | ✓ | ✓ | 30, 100, 300 |
| Rated Current | number | A | ✓ | ✓ | 25, 40, 63, 100 |
| RCCB Type | enum | — | ✓ | ✓ | AC, A, B |

#### 1.7.3 Distribution Board — `electrical/switchgear/distribution-board` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Number of Ways | number | — | ✓ | ✓ | 4, 6, 8, 12, 16, 18 |
| Phase | enum | — | ✓ | ✓ | Single, Three |
| IP Rating | enum | — | ✗ | ✓ | IP20, IP42, IP54, IP65 |
| Door Type | enum | — | ✗ | ✗ | Metal, Acrylic, None |

#### 1.7.4 Isolator — `electrical/switchgear/isolator` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Rated Current | number | A | ✓ | ✓ | 32, 40, 63, 100 |

---

## 2. Plumbing

*What's behind the wall* (per 0001). No level-1 attributes beyond the global set.

### 2.1 Pipes — `plumbing/pipes` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Pipe Material | enum | — | ✓ | ✓ | CPVC, UPVC, PVC, SWR, PPR, GI, HDPE |
| Nominal Diameter | number | mm | ✓ | ✓ | 15, 20, 25, 32, 40, 50, 63, 75, 90, 110 |
| Pressure Class | enum | — | ✓ | ✓ | SDR 11, SDR 13.5, Class 1, Class 2, Class 3, Type A, Type B |
| Application | enum | — | ✗ | ✓ | Hot Water, Cold Water, Drainage, Agriculture |

Pipe length is packaging → `pack_content_qty` (finding 2).

### 2.2 Pipe Fittings — `plumbing/pipe-fittings` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Fitting Type | enum | — | ✓ | ✓ | Elbow 90°, Elbow 45°, Tee, Coupler, Reducer, Union, End Cap, Bend, Trap |
| Material | enum | — | ✓ | ✓ | CPVC, UPVC, PVC, PPR, GI, Brass |
| Size | number | mm | ✓ | ✓ | 15, 20, 25, 32, 40, 50, 63, 75, 90, 110 |
| Connection Type | enum | — | ✗ | ✓ | Solvent Weld, Threaded, Push-fit |

### 2.3 Valves — `plumbing/valves` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Valve Type | enum | — | ✓ | ✓ | Ball, Gate, Globe, Check / NRV, Butterfly, Foot, Angle |
| Size | number | mm | ✓ | ✓ | 15, 20, 25, 32, 40, 50 |
| Body Material | enum | — | ✓ | ✓ | Brass, CPVC, PVC, Cast Iron, Stainless Steel |
| Pressure Rating | number | bar | ✗ | ✗ | — |

### 2.4 Water Tanks — `plumbing/water-tanks` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Capacity | number | litres | ✓ | ✓ | 500, 750, 1000, 1500, 2000, 5000 |
| Layers | enum | — | ✓ | ✓ | 2, 3, 4, 5 |
| Material | enum | — | ✓ | ✓ | HDPE, LLDPE, Concrete, Stainless Steel |
| Shape | enum | — | ✓ | ✓ | Vertical, Horizontal, Loft |
| Colour | text | — | ✗ | ✗ | — |

---

## 3. Sanitaryware & Bath

*What you see and touch* (per 0001).

Declared at level 1, inherited by all seven leaves:

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Finish | enum | — | ✓ | ✓ | Chrome, Matte Black, Rose Gold, Brushed Nickel, Gold, White, Ivory |

### 3.1 Water Closets — `sanitaryware/water-closets` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| WC Type | enum | — | ✓ | ✓ | Floor Mounted, Wall Hung, One Piece, Two Piece, Indian / Orissa, Anglo-Indian |
| Trap Type | enum | — | ✓ | ✓ | S-Trap, P-Trap, Wall-hung |
| Trap Distance | number | mm | ✓ | ✓ | 225, 250, 300 |
| Flush Type | enum | — | ✗ | ✓ | Single, Dual |
| Rimless | boolean | — | ✗ | ✓ | — |
| Material | enum | — | ✗ | ✗ | Vitreous China, Ceramic |

### 3.2 Wash Basins — `sanitaryware/wash-basins` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Basin Type | enum | — | ✓ | ✓ | Wall Mounted, Table Top, Under Counter, Semi-Recessed, Pedestal, Counter Top |
| Shape | enum | — | ✓ | ✓ | Round, Oval, Rectangular, Square |
| Dimensions | text | mm | ✓ | ✗ | — |
| Tap Hole | enum | — | ✗ | ✗ | Single, Three, None |

### 3.3 Cisterns — `sanitaryware/cisterns` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Cistern Type | enum | — | ✓ | ✓ | Concealed, Exposed, Wall Mounted |
| Flush Mechanism | enum | — | ✓ | ✓ | Single, Dual |
| Capacity | number | litres | ✓ | ✗ | 3, 6, 9 |

### 3.4 Urinals — `sanitaryware/urinals` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Urinal Type | enum | — | ✓ | ✓ | Wall Hung, Floor, Waterless |
| Sensor Operated | boolean | — | ✓ | ✓ | — |

### 3.5 Taps & Faucets — `sanitaryware/taps-faucets` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Tap Type | enum | — | ✓ | ✓ | Pillar Cock, Bib Cock, Sink Mixer, Basin Mixer, Wall Mixer, Single Lever, Angle Valve, Health Faucet |
| Mounting | enum | — | ✓ | ✓ | Deck, Wall, Floor |
| Handle Type | enum | — | ✓ | ✓ | Single Lever, Quarter Turn, Half Turn |
| Body Material | enum | — | ✗ | ✓ | Brass, Stainless Steel, Zinc Alloy |
| Cartridge Size | number | mm | ✗ | ✗ | 35, 40 |

### 3.6 Showers — `sanitaryware/showers` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Shower Type | enum | — | ✓ | ✓ | Overhead, Hand Shower, Shower Panel, Rain Shower, Body Jet |
| Shape | enum | — | ✓ | ✓ | Round, Square, Rectangular |
| Size | number | mm | ✓ | ✓ | 100, 150, 200, 250, 300 |
| Flow Modes | number | — | ✗ | ✗ | — |
| Arm Included | boolean | — | ✗ | ✗ | — |

### 3.7 Bath Accessories — `sanitaryware/bath-accessories` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Accessory Type | enum | — | ✓ | ✓ | Towel Rail, Towel Ring, Soap Dish, Robe Hook, Toilet Paper Holder, Grab Bar, Shelf |
| Material | enum | — | ✓ | ✓ | Stainless Steel, Brass, Aluminium, Glass, Plastic |
| Mounting | enum | — | ✗ | ✗ | Wall, Freestanding |

---

## 4. Hardware Tools & Accessories

No level-1 attributes beyond the global set. Four of its six children are non-leaf, and
this is where inheritance carries the most weight.

### 4.1 Adhesives & Sealants — `hardware/adhesives-sealants` · leaf

Tile adhesive and grout live here per 0001, not under Tiles.

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Product Type | enum | — | ✓ | ✓ | Tile Adhesive, Tile Grout, Silicone Sealant, Solvent Cement, Epoxy, PU Foam, Construction Adhesive, Wood Adhesive |
| Base | enum | — | ✓ | ✓ | Cement, Acrylic, Silicone, Epoxy, PU, Solvent |
| Colour | text | — | ✓ | ✓ | — |
| Coverage | number | sqft/kg | ✗ | ✗ | — |
| Cure Time | number | hours | ✗ | ✗ | — |

### 4.2 Safety & Site Equipment — `hardware/safety-equipment` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Equipment Type | enum | — | ✓ | ✓ | Helmet, Safety Shoes, Gloves, Goggles, Harness, Vest, Mask |
| Size | enum | — | ✓ | ✓ | S, M, L, XL, XXL, 6, 7, 8, 9, 10, 11 |
| Standard | enum | — | ✗ | ✓ | IS 2925, EN 397, ISI, None |

### 4.3 Hand Tools — `hardware/hand-tools` · **non-leaf**

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Handle Material | enum | — | ✗ | ✓ | Wood, Fibreglass, Rubber Grip, Steel, Plastic |
| Tool Steel / Coating | enum | — | ✗ | ✗ | Chrome Vanadium, Carbon Steel, Nickel Plated, Forged Steel |

#### 4.3.1 Hammers — `hardware/hand-tools/hammers` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Hammer Type | enum | — | ✓ | ✓ | Claw, Ball Pein, Sledge, Rubber Mallet, Chipping, Club |
| Head Weight | number | g | ✓ | ✓ | 200, 340, 450, 570, 900, 1800, 3600 |
| Head Material | enum | — | ✗ | ✗ | Steel, Rubber, Copper, Nylon |

#### 4.3.2 Spanners & Wrenches — `hardware/hand-tools/spanners-wrenches` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Wrench Type | enum | — | ✓ | ✓ | Open End, Ring, Combination, Adjustable, Pipe, Socket, Allen / Hex |
| Size | number | mm | ✓ | ✓ | 6, 8, 10, 12, 14, 17, 19, 21, 24 |
| Piece Count | number | pcs | ✓ | ✓ | 1, 6, 8, 12, 21 |
| Drive Size | enum | inch | ✗ | ✓ | 1/4, 3/8, 1/2 |

#### 4.3.3 Screwdrivers & Pliers — `hardware/hand-tools/screwdrivers-pliers` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Tool Type | enum | — | ✓ | ✓ | Screwdriver, Combination Plier, Nose Plier, Cutting Plier, Wire Stripper, Tester |
| Tip Type | enum | — | ✓ | ✓ | Flat, Philips, Torx, Hex, Pozidriv |
| Length | number | mm | ✓ | ✗ | 100, 150, 200, 250 |
| Insulated | boolean | — | ✗ | ✓ | — |

#### 4.3.4 Measuring Tools — `hardware/hand-tools/measuring-tools` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Tool Type | enum | — | ✓ | ✓ | Measuring Tape, Spirit Level, Try Square, Vernier Caliper, Plumb Bob, Laser Level |
| Range / Length | number | m | ✓ | ✓ | 1, 2, 3, 5, 7.5, 10, 30 |
| Blade Width | number | mm | ✗ | ✗ | 13, 16, 19, 25 |
| Accuracy Class | text | — | ✗ | ✗ | — |

#### 4.3.5 Masonry Hand Tools — `hardware/hand-tools/masonry-tools` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Tool Type | enum | — | ✓ | ✓ | Trowel, Float, Chisel, Bolster, Hawk, Jointer |
| Blade Size | number | mm | ✓ | ✓ | 150, 200, 250, 300 |
| Blade Material | enum | — | ✗ | ✗ | Carbon Steel, Stainless Steel, Plastic |

### 4.4 Power Tools — `hardware/power-tools` · **non-leaf**

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Power Source | enum | — | ✓ | ✓ | Corded, Cordless (Battery), Pneumatic |
| Input Power | number | W | ✗ | ✓ | — |
| Battery Voltage | number | V | ✓ | ✓ | 12, 18, 20, 24 |
| No-Load Speed | number | RPM | ✗ | ✗ | — |

#### 4.4.1 Drills — `hardware/power-tools/drills` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Drill Type | enum | — | ✓ | ✓ | Impact Drill, Rotary Hammer, Driver Drill, Core Drill |
| Chuck Size | number | mm | ✓ | ✓ | 10, 13 |
| Chuck Type | enum | — | ✗ | ✗ | Keyed, Keyless, SDS |
| Max Drilling Capacity | number | mm | ✗ | ✗ | — |

#### 4.4.2 Grinders — `hardware/power-tools/grinders` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Grinder Type | enum | — | ✓ | ✓ | Angle Grinder, Die Grinder, Bench Grinder |
| Disc Diameter | number | mm | ✓ | ✓ | 100, 115, 125, 180, 230 |

#### 4.4.3 Saws & Cutters — `hardware/power-tools/saws-cutters` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Saw Type | enum | — | ✓ | ✓ | Circular Saw, Jigsaw, Reciprocating Saw, Miter Saw, Marble Cutter, Chop Saw |
| Blade Diameter | number | mm | ✓ | ✓ | 110, 185, 235, 255, 355 |
| Cutting Depth | number | mm | ✗ | ✗ | — |

#### 4.4.4 Demolition & Breakers — `hardware/power-tools/demolition` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Tool Type | enum | — | ✓ | ✓ | Demolition Hammer, Breaker, Chipping Hammer |
| Impact Energy | number | J | ✓ | ✓ | — |
| Chisel Shank | enum | — | ✓ | ✓ | SDS-Plus, SDS-Max, Hex 17mm, Hex 30mm |

### 4.5 Fasteners — `hardware/fasteners` · **non-leaf**

The strongest inheritance case in the catalog — five attributes shared by every leaf:

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Material | enum | — | ✓ | ✓ | Mild Steel, SS 304, SS 202, Brass, GI, Alloy Steel |
| Coating | enum | — | ✓ | ✓ | Zinc Plated, Galvanized, Black Oxide, Plain |
| Diameter | number | mm | ✓ | ✓ | 3, 4, 5, 6, 8, 10, 12, 16, 20 |
| Length | number | mm | ✓ | ✓ | 12, 16, 20, 25, 32, 40, 50, 65, 75, 100 |
| Pack Quantity | number | pcs | ✓ | ✗ | 10, 50, 100, 200, 500, 1000 |

#### 4.5.1 Screws — `hardware/fasteners/screws` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Screw Type | enum | — | ✓ | ✓ | Wood Screw, Self-Tapping, Drywall, Machine Screw, CSK |
| Head Type | enum | — | ✓ | ✓ | Flat / CSK, Pan, Hex, Round, Truss |
| Drive Type | enum | — | ✗ | ✓ | Philips, Slotted, Torx, Hex |

#### 4.5.2 Bolts & Nuts — `hardware/fasteners/bolts-nuts` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Bolt Type | enum | — | ✓ | ✓ | Hex Bolt, Carriage Bolt, Foundation Bolt, Eye Bolt, Nut, Washer |
| Property Class | enum | — | ✓ | ✓ | 4.6, 8.8, 10.9, 12.9 |
| Thread Type | enum | — | ✗ | ✗ | Full Thread, Partial Thread |

#### 4.5.3 Anchors & Fixings — `hardware/fasteners/anchors-fixings` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Anchor Type | enum | — | ✓ | ✓ | Wedge Anchor, Sleeve Anchor, Drop-in Anchor, Chemical Anchor, Plastic Wall Plug |
| Base Material | enum | — | ✓ | ✓ | Concrete, Brick, Drywall, Hollow Block |
| Load Capacity | number | kg | ✗ | ✓ | — |

#### 4.5.4 Nails & Rivets — `hardware/fasteners/nails-rivets` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Type | enum | — | ✓ | ✓ | Wire Nail, Concrete Nail, Roofing Nail, Panel Pin, Pop Rivet |
| Gauge | number | — | ✗ | ✗ | — |

### 4.6 Door & Window Hardware — `hardware/door-window-hardware` · **non-leaf**

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Material | enum | — | ✓ | ✓ | Stainless Steel, Brass, Aluminium, Iron, Zinc Alloy |
| Finish | enum | — | ✓ | ✓ | SS Finish, Antique Brass, Matte Black, Chrome, Powder Coated, Rose Gold |

#### 4.6.1 Locks — `hardware/door-window-hardware/locks` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Lock Type | enum | — | ✓ | ✓ | Mortise, Cylindrical, Padlock, Rim Lock, Digital / Smart, Drawer Lock |
| Key Type | enum | — | ✓ | ✓ | Single Side, Both Side, Knob, Keyless |
| Backset | number | mm | ✓ | ✗ | 45, 57, 60, 70 |
| Number of Keys | number | — | ✗ | ✗ | — |

#### 4.6.2 Hinges — `hardware/door-window-hardware/hinges` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Hinge Type | enum | — | ✓ | ✓ | Butt, Piano, Concealed / Euro, Spring, Pivot |
| Size | number | mm | ✓ | ✓ | 50, 75, 100, 125, 150 |
| Bearing Type | enum | — | ✗ | ✗ | Ball Bearing, Plain, Soft Close |

#### 4.6.3 Handles & Knobs — `hardware/door-window-hardware/handles-knobs` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Handle Type | enum | — | ✓ | ✓ | Door Handle, Cabinet Handle, Knob, Pull Handle |
| Centre-to-Centre | number | mm | ✓ | ✓ | 96, 128, 160, 192, 224, 256 |
| Length | number | mm | ✓ | ✗ | — |

#### 4.6.4 Closers & Door Accessories — `hardware/door-window-hardware/closers-accessories` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Product Type | enum | — | ✓ | ✓ | Door Closer, Floor Spring, Tower Bolt, Aldrop, Door Stopper, Magnetic Catcher |
| Door Weight Capacity | number | kg | ✓ | ✓ | 45, 65, 80, 100, 120 |
| Power Grade | enum | — | ✗ | ✗ | EN1, EN2, EN3, EN4 |

---

## 5. Lights (decorative)

Declared at level 1 and inherited by all four leaves. Note the `display_order` — aesthetic
attributes come first, technical ones last, applying the guideline from
[0004](decisions/0004-filter-character-by-category.md).

| # | Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|---|
| 1 | Style / Theme | enum | — | ✗ | ✓ | Modern, Contemporary, Traditional, Industrial, Vintage, Minimalist, Bohemian |
| 2 | Finish | enum | — | ✓ | ✓ | Gold, Black, Chrome, Antique Brass, White, Wood, Copper |
| 3 | Body Material | enum | — | ✓ | ✓ | Metal, Glass, Crystal, Wood, Fabric, Acrylic, Rattan |
| 4 | Number of Lights | number | — | ✓ | ✓ | 1, 2, 3, 5, 6, 8, 12 |
| 8 | Lamp Holder Type | enum | — | ✗ | ✓ | B22, E27, E14, G9, GU10, Integrated LED |
| 9 | Dimmable | boolean | — | ✗ | ✗ | — |
| 10 | Bulb Included | boolean | — | ✗ | ✗ | — |

### 5.1 Ceiling Lights — `lights/ceiling-lights` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Fixture Type | enum | — | ✓ | ✓ | Chandelier, Pendant, Flush Mount, Semi-Flush, Cove / Profile, Track, Spotlight |
| Diameter / Width | number | mm | ✓ | ✓ | — |
| Drop Length | number | mm | ✓ | ✗ | — |
| Height Adjustable | boolean | — | ✗ | ✗ | — |

### 5.2 Wall Lights — `lights/wall-lights` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Fixture Type | enum | — | ✓ | ✓ | Wall Sconce, Picture / Mirror Light, Up-Down Light, Swing Arm, Wall Washer |
| Light Direction | enum | — | ✓ | ✓ | Up, Down, Up & Down |
| Projection | number | mm | ✗ | ✗ | — |

### 5.3 Outdoor & Garden Lights — `lights/outdoor-garden` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Fixture Type | enum | — | ✓ | ✓ | Gate / Post Light, Bollard, Spike Light, Wall Lantern, String Light, Flood Light, Step Light |
| IP Rating | enum | — | ✓ | ✓ | IP44, IP54, IP65, IP66, IP67 |
| Solar Powered | boolean | — | ✓ | ✓ | — |

IP Rating is technical but non-negotiable outdoors — the 0004 guideline is a default, not a
prohibition.

### 5.4 Lamps — `lights/lamps` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Lamp Type | enum | — | ✓ | ✓ | Table Lamp, Floor Lamp, Desk Lamp, Bedside Lamp |
| Height | number | mm | ✓ | ✓ | — |
| Shade Material | enum | — | ✓ | ✓ | Fabric, Glass, Metal, Paper |
| Switch Type | enum | — | ✗ | ✗ | Inline, Touch, Foot, Pull Chain |

---

## 6. Tiles

The clearest payoff of inheritance in the whole catalog — twelve attributes declared at
level 1, and each leaf adds only one or two. Note `Tile Material` is an **attribute**, not a
category, which was one of the two corrections recorded in 0001.

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Tile Material | enum | — | ✓ | ✓ | Vitrified (GVT), Vitrified (PGVT), Ceramic, Porcelain, Mosaic, Cement / Terrazzo |
| Size | enum | mm | ✓ | ✓ | 300×300, 300×450, 250×375, 600×600, 600×1200, 800×800, 1200×1800 |
| Finish | enum | — | ✓ | ✓ | Glossy, Matte, Satin, Rustic, Carving, Polished, Sugar, Lappato |
| Colour Family | enum | — | ✓ | ✓ | White, Beige, Grey, Brown, Black, Blue, Wood, Multi |
| Thickness | number | mm | ✓ | ✗ | 6, 8, 9, 10, 12 |
| Pattern | enum | — | ✗ | ✓ | Plain, Marble, Wood, Stone, Geometric, Digital Print |
| PEI / Abrasion Rating | enum | — | ✗ | ✓ | PEI I, PEI II, PEI III, PEI IV, PEI V |
| Anti-Skid | boolean | — | ✗ | ✓ | — |
| Shade Variation | enum | — | ✗ | ✗ | V1, V2, V3, V4 |
| Tiles per Box | number | pcs | ✗ | ✗ | — |
| Coverage per Box | number | sqft | ✗ | ✗ | — |
| Water Absorption | number | % | ✗ | ✗ | — |

`Shade Variation` of V3/V4 should set `master_product.has_natural_variation = true` (0003).

### 6.1 Floor Tiles — `tiles/floor-tiles` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Application Area | enum | — | ✗ | ✓ | Living Room, Bedroom, Kitchen, Bathroom, Commercial |

### 6.2 Wall Tiles — `tiles/wall-tiles` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Application Area | enum | — | ✗ | ✓ | Kitchen Backsplash, Bathroom, Living Room, Exterior |
| Highlighter | boolean | — | ✗ | ✓ | — |

### 6.3 Outdoor & Parking Tiles — `tiles/outdoor-parking` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Load Class | enum | — | ✓ | ✓ | Light, Medium, Heavy |
| Anti-Skid Rating | enum | — | ✗ | ✓ | R9, R10, R11, R12, R13 |

### 6.4 Elevation Tiles — `tiles/elevation-tiles` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Elevation Type | enum | — | ✓ | ✓ | Cladding, HD Elevation, 3D |
| Weather Resistant | boolean | — | ✗ | ✓ | — |

---

## 7. Paint

Declared at level 1, inherited by all eight leaves:

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Sheen | enum | — | ✓ | ✓ | Matt, Soft Sheen, Satin, Semi-Gloss, High Gloss |
| Application Surface | enum | — | ✗ | ✓ | Interior Wall, Exterior Wall, Wood, Metal, Ceiling |
| Washability | enum | — | ✗ | ✓ | Low, Medium, High |
| Coverage | number | sqft/L | ✗ | ✗ | — |
| Drying Time | number | hours | ✗ | ✗ | — |
| Low VOC / Low Odour | boolean | — | ✗ | ✓ | — |

**`Base Type` is not here at all.** [0007](decisions/0007-colour-family-pricing.md) removed
base from the paint SKU — a paint product is now line + pack size ("Royale Luxury Emulsion,
20L"), and the base is resolved from the chosen shade at fulfilment. It is a property of
the order line, never of the product.

Shade is **not** listed here and never will be — per 0002 it is order-time configuration,
not an attribute. Colour faceting comes from `shade_families` on the search document, and
`colour_family` is also the *pricing* key per 0007.

Pack size is `pack_content_qty` with the category's unit of measure, not an attribute
(finding 2 of [0005](decisions/0005-attribute-storage-and-identity-columns.md)) — which
also sidesteps the litres-vs-kilograms problem that putty would otherwise create.

### 7.1 Interior Emulsion — `paint/interior-emulsion` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Product Grade | enum | — | ✓ | ✓ | Economy, Premium, Luxury |
| Stain Resistant | boolean | — | ✗ | ✓ | — |
| Anti-Bacterial | boolean | — | ✗ | ✓ | — |

### 7.2 Exterior Emulsion — `paint/exterior-emulsion` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Product Grade | enum | — | ✓ | ✓ | Economy, Premium, Luxury |
| Weather Protection | number | years | ✗ | ✓ | 3, 5, 7, 8, 10, 12 |
| Algae & Fungal Resistant | boolean | — | ✗ | ✓ | — |

### 7.3 Enamel — `paint/enamel` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Enamel Type | enum | — | ✓ | ✓ | Synthetic, Water-Based, PU |

### 7.4 Primer — `paint/primer` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Primer Type | enum | — | ✓ | ✓ | Wall Primer, Wood Primer, Metal / Red Oxide, Cement Primer |
| Solvent Base | enum | — | ✓ | ✓ | Water-Based, Solvent-Based |

### 7.5 Putty — `paint/putty` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Putty Type | enum | — | ✓ | ✓ | White Cement, Acrylic, POP |

Putty is `sale_unit_type = 'discrete'` and sold by weight — never tinted.

### 7.6 Waterproofing — `paint/waterproofing` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Product Type | enum | — | ✓ | ✓ | Liquid Membrane, Cementitious, Bituminous, Crystalline, Injection Grout |
| Application Area | enum | — | ✓ | ✓ | Terrace, Bathroom, Basement, External Wall, Water Tank |
| Elongation | number | % | ✗ | ✗ | — |

### 7.7 Wood Finishes — `paint/wood-finishes` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Finish Type | enum | — | ✓ | ✓ | PU, Melamine, Varnish, Wood Stain, Lacquer |

### 7.8 Texture & Special Finishes — `paint/texture-finishes` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Texture Type | enum | — | ✓ | ✓ | Sand, Metallic, Stucco, Marble Finish, Concrete |
| Application Tool | enum | — | ✗ | ✗ | Roller, Trowel, Spray, Brush |

---

## 8. Stone

Declared at level 1, inherited by both leaves:

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Finish | enum | — | ✓ | ✓ | Polished, Honed, Flamed, Leather, Brushed, Bush Hammered, Sandblasted |
| Thickness | number | mm | ✓ | ✓ | 16, 18, 20, 25, 30 |
| Slab / Tile Size | text | mm | ✓ | ✓ | — |
| Colour Family | enum | — | ✗ | ✓ | Black, White, Grey, Brown, Beige, Green, Red, Multi |
| Application | enum | — | ✗ | ✓ | Flooring, Countertop, Wall Cladding, Staircase, Elevation |
| Edge Type | enum | — | ✗ | ✗ | Machine Cut, Hand Cut |

Per 0003, `master_product` for stone is *variety + finish + thickness*, so Finish and
Thickness are variant-defining. Stone variety itself is **not** an attribute — see
finding 3. Grade is **not** here either; it lives on `vendor_listing.stated_grade` and forms
part of listing identity ([0009](decisions/0009-stone-price-list-model.md)).

Both leaves should set `has_natural_variation = true` for natural stone.

### 8.1 Natural Stone — `stone/natural-stone` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Stone Type | enum | — | ✓ | ✓ | Granite, Marble, Kota, Sandstone, Slate, Limestone |
| Origin Region | text | — | ✗ | ✓ | — |
| Porosity | enum | — | ✗ | ✗ | Low, Medium, High |

### 8.2 Engineered Stone — `stone/engineered-stone` · leaf

| Attribute | Type | Unit | V | F | Values |
|---|---|---|---|---|---|
| Engineered Type | enum | — | ✓ | ✓ | Quartz, Engineered Marble, Sintered Stone |
| Consistency Guarantee | boolean | — | ✗ | ✓ | — |

---

## Summary

| Top level | Leaves | Level-1 attributes | Notes |
|---|---|---|---|
| Electrical | 10 | 0 | Switchgear declares 3, inherited by 4 leaves |
| Plumbing | 4 | 0 | Nothing genuinely shared |
| Sanitaryware & Bath | 7 | 1 | Finish |
| Hardware Tools | 19 | 0 | 4 non-leaf groups declare 2–5 each |
| Lights | 4 | 7 | Aesthetic-first ordering per 0004 |
| Tiles | 4 | 12 | Strongest inheritance payoff |
| Paint | 8 | 6 | Shade and base both live outside attributes |
| Stone | 2 | 6 | Variety and grade live outside attributes |
| **Total** | **58 leaves** | | |

---

## Findings requiring a decision

Three things surfaced while building this that contradict the current documents. None are
reflected in the tables above.

### Finding 1 — The inheritance model has no global scope

Decision 0001 and `catalog-entity-model.md` both say `Brand` and `Warranty` are "declared
once near the root". **There is no root.** There are eight top-level categories, so
"declared once" would in fact be eight duplicate rows — precisely the duplication that
inheritance was chosen to avoid.

Options: a synthetic hidden root category at level 0 (widening the depth cap to 0–3), or
making `attribute.category_id` **nullable**, where `NULL` means global. The latter is
cleaner — no phantom node in the tree, no change to the depth cap, and the recursive CTE
gains one `UNION` branch for the global set.

### Finding 2 — Several natural "attributes" are already columns

`Brand` is `master_product.brand_id`. Pack size is `pack_content_qty` with the category's
UOM. `HSN Code` is a column. Declaring
any of them as attributes creates two sources of truth.

A rule is needed: **if it exists on `master_product`, it is not an attribute.** Applying it
also dissolves a problem that would otherwise have hit Paint — "Pack Size" in litres cannot
describe putty, which is sold by weight, and `attribute.unit` is a single column per
attribute.

The distinction to record: *packaging* quantities are columns (wire coil length, pipe
length, paint pack size), while *product dimensions* stay attributes (bolt length, tile
thickness, shower size).

### Finding 3 — Stone variety cannot be an attribute

Decision 0003 makes the variety trade name the product's identity and creates
`stone_variety` + `stone_variety_alias` as reference tables. But `attribute.data_type` is
only `enum | number | text | boolean` — there is no reference type, so an attribute cannot
point at `stone_variety`.

`master_product.stone_variety_id` as a nullable column, exactly parallel to `brand_id`, is
the consistent answer — variety *is* identity, and identity lives in columns. The
alternative is adding a `reference` data type to `attribute` with a target-table column,
which is more machinery for one case.

`stone_variety` is referenced from `master_product` — a reference table for values that are
neither attributes nor SKUs.
