'use strict';

/**
 * Phase 1 taxonomy — the concrete data behind
 * docs/catalog-structure.md, which is the source of truth for this file.
 *
 * Structure:
 *   GLOBAL_ATTRIBUTES  attributes with category_id = NULL (finding 1: there is
 *                      no root category, so "global" is a NULL category_id
 *                      rather than eight duplicated rows)
 *   TREE               8 top-level categories -> 58 leaves. A node's `attrs`
 *                      are DECLARED there; every descendant inherits them
 *                      (decision 0001), so a non-leaf node's attrs are not
 *                      repeated on its children.
 *
 * Attribute shape: [code, name, dataType, unit, variantDefining, filterable, values]
 *   dataType  'enum' | 'number' | 'text' | 'boolean'
 *   values    enum options in display order; [] for non-enum types
 *
 * Deliberately NOT here, per finding 2 ("if it exists on master_product, it is
 * not an attribute"): brand, HSN code, country of origin, and packaging
 * quantities (wire coil length, pipe length, paint pack size) — those are
 * master_product columns. Product DIMENSIONS remain attributes.
 * Per finding 3, stone variety is master_product.stone_variety_id, not an
 * attribute, because attribute.data_type has no reference type.
 */

// Units of measure referenced by category defaults.
const UNITS = [
  ['NOS', 'Numbers'],
  ['MTR', 'Metre'],
  ['SQFT', 'Square Foot'],
  ['SQM', 'Square Metre'],
  ['LTR', 'Litre'],
  ['KG', 'Kilogram'],
  ['BOX', 'Box'],
  ['SET', 'Set'],
  ['PKT', 'Packet'],
  ['ROLL', 'Roll'],
];

const GLOBAL_ATTRIBUTES = [
  ['warranty_period', 'Warranty Period', 'number', 'months', false, false, []],
  ['certification_mark', 'Certification Mark', 'enum', null, false, true,
    ['ISI', 'BIS', 'CE', 'ISO', 'None']],
];

const TREE = [
  {
    name: 'Electrical', slug: 'electrical', uom: 'NOS', attrs: [],
    children: [
      { name: 'Wires & Cables', slug: 'wires-cables', uom: 'MTR', attrs: [
        ['cable_type', 'Cable Type', 'enum', null, true, true,
          ['House Wire (FR)', 'House Wire (FRLS)', 'Flexible Cable', 'Armoured Cable', 'Submersible Cable', 'Coaxial', 'LAN']],
        ['conductor_size', 'Conductor Size', 'number', 'sq mm', true, true,
          ['0.75', '1.0', '1.5', '2.5', '4', '6', '10', '16', '25', '35', '50']],
        ['number_of_cores', 'Number of Cores', 'number', null, true, true, ['1', '2', '3', '4']],
        ['conductor_material', 'Conductor Material', 'enum', null, true, true, ['Copper', 'Aluminium']],
        ['insulation', 'Insulation', 'enum', null, false, true, ['PVC', 'XLPE', 'FR', 'FRLS', 'HRFR']],
        ['voltage_grade', 'Voltage Grade', 'enum', 'V', false, false, ['650', '1100']],
      ]},
      { name: 'Switches & Sockets', slug: 'switches-sockets', uom: 'NOS', attrs: [
        ['device_type', 'Device Type', 'enum', null, true, true,
          ['One-way Switch', 'Two-way Switch', 'Bell Push', 'Socket 6A', 'Socket 16A', 'Combined 6/16A', 'Fan Regulator', 'Dimmer', 'USB Socket']],
        ['module_size', 'Module Size', 'number', 'modules', true, true, ['1', '2', '3', '4', '6']],
        ['current_rating', 'Current Rating', 'number', 'A', true, true, ['6', '10', '16', '20', '25']],
        ['series', 'Series', 'text', null, true, true, []],
        ['finish', 'Finish', 'enum', null, true, true, ['White', 'Ivory', 'Black', 'Silver', 'Gold', 'Wood']],
      ]},
      { name: 'Switch Plates & Frames', slug: 'switch-plates', uom: 'NOS', attrs: [
        ['module_capacity', 'Module Capacity', 'number', 'modules', true, true, ['1', '2', '3', '4', '6', '8', '12', '18']],
        ['plate_material', 'Material', 'enum', null, true, true, ['Polycarbonate', 'ABS', 'Metal', 'Glass', 'Wood']],
        ['plate_finish', 'Finish', 'enum', null, true, true, ['White', 'Ivory', 'Black', 'Silver', 'Gold', 'Wood']],
        ['plate_series', 'Series', 'text', null, true, true, []],
      ]},
      { name: 'Conduits & Accessories', slug: 'conduits', uom: 'NOS', attrs: [
        ['conduit_product_type', 'Product Type', 'enum', null, true, true,
          ['Rigid Conduit', 'Flexible Conduit', 'Bend', 'Coupler', 'Junction Box', 'Saddle']],
        ['conduit_diameter', 'Diameter', 'number', 'mm', true, true, ['20', '25', '32', '40', '50']],
        ['conduit_material', 'Material', 'enum', null, true, true, ['PVC', 'HDPE', 'GI']],
        ['duty_grade', 'Duty Grade', 'enum', null, true, true, ['Light', 'Medium', 'Heavy']],
      ]},
      { name: 'Fans', slug: 'fans', uom: 'NOS', attrs: [
        ['fan_type', 'Fan Type', 'enum', null, true, true, ['Ceiling', 'Exhaust', 'Wall', 'Pedestal', 'Table', 'Tower']],
        ['sweep_size', 'Sweep Size', 'number', 'mm', true, true, ['600', '900', '1200', '1400']],
        ['motor_type', 'Motor Type', 'enum', null, true, true, ['Induction', 'BLDC']],
        ['power_consumption', 'Power Consumption', 'number', 'W', false, true, []],
        ['star_rating', 'Star Rating', 'enum', null, false, true, ['1', '2', '3', '4', '5']],
        ['blade_count', 'Blade Count', 'number', null, false, false, []],
        ['fan_speed', 'Speed', 'number', 'RPM', false, false, []],
        ['fan_finish', 'Finish', 'text', null, true, true, []],
      ]},
      { name: 'LED Bulbs & Tubes', slug: 'led-bulbs-tubes', uom: 'NOS', attrs: [
        ['lamp_type', 'Lamp Type', 'enum', null, true, true,
          ['LED Bulb', 'LED Tube', 'LED Panel', 'LED Downlighter', 'LED Strip', 'LED Batten']],
        ['wattage', 'Wattage', 'number', 'W', true, true, ['3', '5', '7', '9', '12', '15', '18', '20', '22', '36']],
        ['cap_base_type', 'Cap / Base Type', 'enum', null, true, true, ['B22', 'E27', 'E14', 'G9', 'GU10', 'T5', 'T8']],
        ['colour_temperature', 'Colour Temperature', 'enum', 'K', true, true,
          ['Warm White 2700K', 'Neutral 4000K', 'Cool Daylight 6500K']],
        ['luminous_flux', 'Luminous Flux', 'number', 'lm', false, false, []],
        ['led_dimmable', 'Dimmable', 'boolean', null, false, true, []],
      ]},
      { name: 'Switchgear', slug: 'switchgear', uom: 'NOS', attrs: [
        ['number_of_poles', 'Number of Poles', 'enum', null, true, true, ['SP', 'SPN', 'DP', 'TP', 'TPN', 'FP']],
        ['breaking_capacity', 'Breaking Capacity', 'number', 'kA', false, true, ['3', '6', '10']],
        ['mounting', 'Mounting', 'enum', null, false, false, ['DIN Rail', 'Surface', 'Flush']],
      ], children: [
        { name: 'MCB', slug: 'mcb', uom: 'NOS', attrs: [
          ['rated_current', 'Rated Current', 'number', 'A', true, true, ['6', '10', '16', '20', '25', '32', '40', '50', '63']],
          ['tripping_curve', 'Tripping Curve', 'enum', null, true, true, ['B', 'C', 'D']],
        ]},
        { name: 'RCCB', slug: 'rccb', uom: 'NOS', attrs: [
          ['sensitivity', 'Sensitivity', 'number', 'mA', true, true, ['30', '100', '300']],
          ['rccb_rated_current', 'Rated Current', 'number', 'A', true, true, ['25', '40', '63', '100']],
          ['rccb_type', 'RCCB Type', 'enum', null, true, true, ['AC', 'A', 'B']],
        ]},
        { name: 'Distribution Board', slug: 'distribution-board', uom: 'NOS', attrs: [
          ['number_of_ways', 'Number of Ways', 'number', null, true, true, ['4', '6', '8', '12', '16', '18']],
          ['phase', 'Phase', 'enum', null, true, true, ['Single', 'Three']],
          ['ip_rating_db', 'IP Rating', 'enum', null, false, true, ['IP20', 'IP42', 'IP54', 'IP65']],
          ['door_type', 'Door Type', 'enum', null, false, false, ['Metal', 'Acrylic', 'None']],
        ]},
        { name: 'Isolator', slug: 'isolator', uom: 'NOS', attrs: [
          ['isolator_rated_current', 'Rated Current', 'number', 'A', true, true, ['32', '40', '63', '100']],
        ]},
      ]},
    ],
  },

  {
    name: 'Plumbing', slug: 'plumbing', uom: 'NOS', attrs: [],
    children: [
      { name: 'Pipes', slug: 'pipes', uom: 'MTR', attrs: [
        ['pipe_material', 'Pipe Material', 'enum', null, true, true, ['CPVC', 'UPVC', 'PVC', 'SWR', 'PPR', 'GI', 'HDPE']],
        ['nominal_diameter', 'Nominal Diameter', 'number', 'mm', true, true,
          ['15', '20', '25', '32', '40', '50', '63', '75', '90', '110']],
        ['pressure_class', 'Pressure Class', 'enum', null, true, true,
          ['SDR 11', 'SDR 13.5', 'Class 1', 'Class 2', 'Class 3', 'Type A', 'Type B']],
        ['pipe_application', 'Application', 'enum', null, false, true, ['Hot Water', 'Cold Water', 'Drainage', 'Agriculture']],
      ]},
      { name: 'Pipe Fittings', slug: 'pipe-fittings', uom: 'NOS', attrs: [
        ['fitting_type', 'Fitting Type', 'enum', null, true, true,
          ['Elbow 90°', 'Elbow 45°', 'Tee', 'Coupler', 'Reducer', 'Union', 'End Cap', 'Bend', 'Trap']],
        ['fitting_material', 'Material', 'enum', null, true, true, ['CPVC', 'UPVC', 'PVC', 'PPR', 'GI', 'Brass']],
        ['fitting_size', 'Size', 'number', 'mm', true, true, ['15', '20', '25', '32', '40', '50', '63', '75', '90', '110']],
        ['connection_type', 'Connection Type', 'enum', null, false, true, ['Solvent Weld', 'Threaded', 'Push-fit']],
      ]},
      { name: 'Valves', slug: 'valves', uom: 'NOS', attrs: [
        ['valve_type', 'Valve Type', 'enum', null, true, true, ['Ball', 'Gate', 'Globe', 'Check / NRV', 'Butterfly', 'Foot', 'Angle']],
        ['valve_size', 'Size', 'number', 'mm', true, true, ['15', '20', '25', '32', '40', '50']],
        ['valve_body_material', 'Body Material', 'enum', null, true, true, ['Brass', 'CPVC', 'PVC', 'Cast Iron', 'Stainless Steel']],
        ['pressure_rating', 'Pressure Rating', 'number', 'bar', false, false, []],
      ]},
      { name: 'Water Tanks', slug: 'water-tanks', uom: 'NOS', attrs: [
        ['tank_capacity', 'Capacity', 'number', 'litres', true, true, ['500', '750', '1000', '1500', '2000', '5000']],
        ['tank_layers', 'Layers', 'enum', null, true, true, ['2', '3', '4', '5']],
        ['tank_material', 'Material', 'enum', null, true, true, ['HDPE', 'LLDPE', 'Concrete', 'Stainless Steel']],
        ['tank_shape', 'Shape', 'enum', null, true, true, ['Vertical', 'Horizontal', 'Loft']],
        ['tank_colour', 'Colour', 'text', null, false, false, []],
      ]},
    ],
  },

  {
    name: 'Sanitaryware & Bath', slug: 'sanitaryware', uom: 'NOS', attrs: [
      ['sanitary_finish', 'Finish', 'enum', null, true, true,
        ['Chrome', 'Matte Black', 'Rose Gold', 'Brushed Nickel', 'Gold', 'White', 'Ivory']],
    ],
    children: [
      { name: 'Water Closets', slug: 'water-closets', uom: 'NOS', attrs: [
        ['wc_type', 'WC Type', 'enum', null, true, true,
          ['Floor Mounted', 'Wall Hung', 'One Piece', 'Two Piece', 'Indian / Orissa', 'Anglo-Indian']],
        ['trap_type', 'Trap Type', 'enum', null, true, true, ['S-Trap', 'P-Trap', 'Wall-hung']],
        ['trap_distance', 'Trap Distance', 'number', 'mm', true, true, ['225', '250', '300']],
        ['flush_type', 'Flush Type', 'enum', null, false, true, ['Single', 'Dual']],
        ['rimless', 'Rimless', 'boolean', null, false, true, []],
        ['wc_material', 'Material', 'enum', null, false, false, ['Vitreous China', 'Ceramic']],
      ]},
      { name: 'Wash Basins', slug: 'wash-basins', uom: 'NOS', attrs: [
        ['basin_type', 'Basin Type', 'enum', null, true, true,
          ['Wall Mounted', 'Table Top', 'Under Counter', 'Semi-Recessed', 'Pedestal', 'Counter Top']],
        ['basin_shape', 'Shape', 'enum', null, true, true, ['Round', 'Oval', 'Rectangular', 'Square']],
        ['basin_dimensions', 'Dimensions', 'text', 'mm', true, false, []],
        ['tap_hole', 'Tap Hole', 'enum', null, false, false, ['Single', 'Three', 'None']],
      ]},
      { name: 'Cisterns', slug: 'cisterns', uom: 'NOS', attrs: [
        ['cistern_type', 'Cistern Type', 'enum', null, true, true, ['Concealed', 'Exposed', 'Wall Mounted']],
        ['flush_mechanism', 'Flush Mechanism', 'enum', null, true, true, ['Single', 'Dual']],
        ['cistern_capacity', 'Capacity', 'number', 'litres', true, false, ['3', '6', '9']],
      ]},
      { name: 'Urinals', slug: 'urinals', uom: 'NOS', attrs: [
        ['urinal_type', 'Urinal Type', 'enum', null, true, true, ['Wall Hung', 'Floor', 'Waterless']],
        ['sensor_operated', 'Sensor Operated', 'boolean', null, true, true, []],
      ]},
      { name: 'Taps & Faucets', slug: 'taps-faucets', uom: 'NOS', attrs: [
        ['tap_type', 'Tap Type', 'enum', null, true, true,
          ['Pillar Cock', 'Bib Cock', 'Sink Mixer', 'Basin Mixer', 'Wall Mixer', 'Single Lever', 'Angle Valve', 'Health Faucet']],
        ['tap_mounting', 'Mounting', 'enum', null, true, true, ['Deck', 'Wall', 'Floor']],
        ['handle_type', 'Handle Type', 'enum', null, true, true, ['Single Lever', 'Quarter Turn', 'Half Turn']],
        ['tap_body_material', 'Body Material', 'enum', null, false, true, ['Brass', 'Stainless Steel', 'Zinc Alloy']],
        ['cartridge_size', 'Cartridge Size', 'number', 'mm', false, false, ['35', '40']],
      ]},
      { name: 'Showers', slug: 'showers', uom: 'NOS', attrs: [
        ['shower_type', 'Shower Type', 'enum', null, true, true,
          ['Overhead', 'Hand Shower', 'Shower Panel', 'Rain Shower', 'Body Jet']],
        ['shower_shape', 'Shape', 'enum', null, true, true, ['Round', 'Square', 'Rectangular']],
        ['shower_size', 'Size', 'number', 'mm', true, true, ['100', '150', '200', '250', '300']],
        ['flow_modes', 'Flow Modes', 'number', null, false, false, []],
        ['arm_included', 'Arm Included', 'boolean', null, false, false, []],
      ]},
      { name: 'Bath Accessories', slug: 'bath-accessories', uom: 'NOS', attrs: [
        ['accessory_type', 'Accessory Type', 'enum', null, true, true,
          ['Towel Rail', 'Towel Ring', 'Soap Dish', 'Robe Hook', 'Toilet Paper Holder', 'Grab Bar', 'Shelf']],
        ['accessory_material', 'Material', 'enum', null, true, true,
          ['Stainless Steel', 'Brass', 'Aluminium', 'Glass', 'Plastic']],
        ['accessory_mounting', 'Mounting', 'enum', null, false, false, ['Wall', 'Freestanding']],
      ]},
    ],
  },

  {
    name: 'Hardware Tools & Accessories', slug: 'hardware', uom: 'NOS', attrs: [],
    children: [
      { name: 'Adhesives & Sealants', slug: 'adhesives-sealants', uom: 'KG', attrs: [
        ['adhesive_product_type', 'Product Type', 'enum', null, true, true,
          ['Tile Adhesive', 'Tile Grout', 'Silicone Sealant', 'Solvent Cement', 'Epoxy', 'PU Foam', 'Construction Adhesive', 'Wood Adhesive']],
        ['adhesive_base', 'Base', 'enum', null, true, true, ['Cement', 'Acrylic', 'Silicone', 'Epoxy', 'PU', 'Solvent']],
        ['adhesive_colour', 'Colour', 'text', null, true, true, []],
        ['coverage_per_kg', 'Coverage', 'number', 'sqft/kg', false, false, []],
        ['cure_time', 'Cure Time', 'number', 'hours', false, false, []],
      ]},
      { name: 'Safety & Site Equipment', slug: 'safety-equipment', uom: 'NOS', attrs: [
        ['equipment_type', 'Equipment Type', 'enum', null, true, true,
          ['Helmet', 'Safety Shoes', 'Gloves', 'Goggles', 'Harness', 'Vest', 'Mask']],
        ['safety_size', 'Size', 'enum', null, true, true, ['S', 'M', 'L', 'XL', 'XXL', '6', '7', '8', '9', '10', '11']],
        ['safety_standard', 'Standard', 'enum', null, false, true, ['IS 2925', 'EN 397', 'ISI', 'None']],
      ]},
      { name: 'Hand Tools', slug: 'hand-tools', uom: 'NOS', attrs: [
        ['handle_material', 'Handle Material', 'enum', null, false, true, ['Wood', 'Fibreglass', 'Rubber Grip', 'Steel', 'Plastic']],
        ['tool_steel_coating', 'Tool Steel / Coating', 'enum', null, false, false,
          ['Chrome Vanadium', 'Carbon Steel', 'Nickel Plated', 'Forged Steel']],
      ], children: [
        { name: 'Hammers', slug: 'hammers', uom: 'NOS', attrs: [
          ['hammer_type', 'Hammer Type', 'enum', null, true, true, ['Claw', 'Ball Pein', 'Sledge', 'Rubber Mallet', 'Chipping', 'Club']],
          ['head_weight', 'Head Weight', 'number', 'g', true, true, ['200', '340', '450', '570', '900', '1800', '3600']],
          ['head_material', 'Head Material', 'enum', null, false, false, ['Steel', 'Rubber', 'Copper', 'Nylon']],
        ]},
        { name: 'Spanners & Wrenches', slug: 'spanners-wrenches', uom: 'NOS', attrs: [
          ['wrench_type', 'Wrench Type', 'enum', null, true, true,
            ['Open End', 'Ring', 'Combination', 'Adjustable', 'Pipe', 'Socket', 'Allen / Hex']],
          ['wrench_size', 'Size', 'number', 'mm', true, true, ['6', '8', '10', '12', '14', '17', '19', '21', '24']],
          ['piece_count', 'Piece Count', 'number', 'pcs', true, true, ['1', '6', '8', '12', '21']],
          ['drive_size', 'Drive Size', 'enum', 'inch', false, true, ['1/4', '3/8', '1/2']],
        ]},
        { name: 'Screwdrivers & Pliers', slug: 'screwdrivers-pliers', uom: 'NOS', attrs: [
          ['sd_tool_type', 'Tool Type', 'enum', null, true, true,
            ['Screwdriver', 'Combination Plier', 'Nose Plier', 'Cutting Plier', 'Wire Stripper', 'Tester']],
          ['tip_type', 'Tip Type', 'enum', null, true, true, ['Flat', 'Philips', 'Torx', 'Hex', 'Pozidriv']],
          ['sd_length', 'Length', 'number', 'mm', true, false, ['100', '150', '200', '250']],
          ['insulated', 'Insulated', 'boolean', null, false, true, []],
        ]},
        { name: 'Measuring Tools', slug: 'measuring-tools', uom: 'NOS', attrs: [
          ['measuring_tool_type', 'Tool Type', 'enum', null, true, true,
            ['Measuring Tape', 'Spirit Level', 'Try Square', 'Vernier Caliper', 'Plumb Bob', 'Laser Level']],
          ['range_length', 'Range / Length', 'number', 'm', true, true, ['1', '2', '3', '5', '7.5', '10', '30']],
          ['blade_width', 'Blade Width', 'number', 'mm', false, false, ['13', '16', '19', '25']],
          ['accuracy_class', 'Accuracy Class', 'text', null, false, false, []],
        ]},
        { name: 'Masonry Hand Tools', slug: 'masonry-tools', uom: 'NOS', attrs: [
          ['masonry_tool_type', 'Tool Type', 'enum', null, true, true, ['Trowel', 'Float', 'Chisel', 'Bolster', 'Hawk', 'Jointer']],
          ['blade_size', 'Blade Size', 'number', 'mm', true, true, ['150', '200', '250', '300']],
          ['blade_material', 'Blade Material', 'enum', null, false, false, ['Carbon Steel', 'Stainless Steel', 'Plastic']],
        ]},
      ]},
      { name: 'Power Tools', slug: 'power-tools', uom: 'NOS', attrs: [
        ['power_source', 'Power Source', 'enum', null, true, true, ['Corded', 'Cordless (Battery)', 'Pneumatic']],
        ['input_power', 'Input Power', 'number', 'W', false, true, []],
        ['battery_voltage', 'Battery Voltage', 'number', 'V', true, true, ['12', '18', '20', '24']],
        ['no_load_speed', 'No-Load Speed', 'number', 'RPM', false, false, []],
      ], children: [
        { name: 'Drills', slug: 'drills', uom: 'NOS', attrs: [
          ['drill_type', 'Drill Type', 'enum', null, true, true, ['Impact Drill', 'Rotary Hammer', 'Driver Drill', 'Core Drill']],
          ['chuck_size', 'Chuck Size', 'number', 'mm', true, true, ['10', '13']],
          ['chuck_type', 'Chuck Type', 'enum', null, false, false, ['Keyed', 'Keyless', 'SDS']],
          ['max_drilling_capacity', 'Max Drilling Capacity', 'number', 'mm', false, false, []],
        ]},
        { name: 'Grinders', slug: 'grinders', uom: 'NOS', attrs: [
          ['grinder_type', 'Grinder Type', 'enum', null, true, true, ['Angle Grinder', 'Die Grinder', 'Bench Grinder']],
          ['disc_diameter', 'Disc Diameter', 'number', 'mm', true, true, ['100', '115', '125', '180', '230']],
        ]},
        { name: 'Saws & Cutters', slug: 'saws-cutters', uom: 'NOS', attrs: [
          ['saw_type', 'Saw Type', 'enum', null, true, true,
            ['Circular Saw', 'Jigsaw', 'Reciprocating Saw', 'Miter Saw', 'Marble Cutter', 'Chop Saw']],
          ['blade_diameter', 'Blade Diameter', 'number', 'mm', true, true, ['110', '185', '235', '255', '355']],
          ['cutting_depth', 'Cutting Depth', 'number', 'mm', false, false, []],
        ]},
        { name: 'Demolition & Breakers', slug: 'demolition', uom: 'NOS', attrs: [
          ['demolition_tool_type', 'Tool Type', 'enum', null, true, true, ['Demolition Hammer', 'Breaker', 'Chipping Hammer']],
          ['impact_energy', 'Impact Energy', 'number', 'J', true, true, []],
          ['chisel_shank', 'Chisel Shank', 'enum', null, true, true, ['SDS-Plus', 'SDS-Max', 'Hex 17mm', 'Hex 30mm']],
        ]},
      ]},
      { name: 'Fasteners', slug: 'fasteners', uom: 'PKT', attrs: [
        ['fastener_material', 'Material', 'enum', null, true, true, ['Mild Steel', 'SS 304', 'SS 202', 'Brass', 'GI', 'Alloy Steel']],
        ['fastener_coating', 'Coating', 'enum', null, true, true, ['Zinc Plated', 'Galvanized', 'Black Oxide', 'Plain']],
        ['fastener_diameter', 'Diameter', 'number', 'mm', true, true, ['3', '4', '5', '6', '8', '10', '12', '16', '20']],
        ['fastener_length', 'Length', 'number', 'mm', true, true, ['12', '16', '20', '25', '32', '40', '50', '65', '75', '100']],
        ['fastener_pack_quantity', 'Pack Quantity', 'number', 'pcs', true, false, ['10', '50', '100', '200', '500', '1000']],
      ], children: [
        { name: 'Screws', slug: 'screws', uom: 'PKT', attrs: [
          ['screw_type', 'Screw Type', 'enum', null, true, true, ['Wood Screw', 'Self-Tapping', 'Drywall', 'Machine Screw', 'CSK']],
          ['screw_head_type', 'Head Type', 'enum', null, true, true, ['Flat / CSK', 'Pan', 'Hex', 'Round', 'Truss']],
          ['screw_drive_type', 'Drive Type', 'enum', null, false, true, ['Philips', 'Slotted', 'Torx', 'Hex']],
        ]},
        { name: 'Bolts & Nuts', slug: 'bolts-nuts', uom: 'PKT', attrs: [
          ['bolt_type', 'Bolt Type', 'enum', null, true, true, ['Hex Bolt', 'Carriage Bolt', 'Foundation Bolt', 'Eye Bolt', 'Nut', 'Washer']],
          ['property_class', 'Property Class', 'enum', null, true, true, ['4.6', '8.8', '10.9', '12.9']],
          ['thread_type', 'Thread Type', 'enum', null, false, false, ['Full Thread', 'Partial Thread']],
        ]},
        { name: 'Anchors & Fixings', slug: 'anchors-fixings', uom: 'PKT', attrs: [
          ['anchor_type', 'Anchor Type', 'enum', null, true, true,
            ['Wedge Anchor', 'Sleeve Anchor', 'Drop-in Anchor', 'Chemical Anchor', 'Plastic Wall Plug']],
          ['base_material', 'Base Material', 'enum', null, true, true, ['Concrete', 'Brick', 'Drywall', 'Hollow Block']],
          ['load_capacity', 'Load Capacity', 'number', 'kg', false, true, []],
        ]},
        { name: 'Nails & Rivets', slug: 'nails-rivets', uom: 'PKT', attrs: [
          ['nail_type', 'Type', 'enum', null, true, true, ['Wire Nail', 'Concrete Nail', 'Roofing Nail', 'Panel Pin', 'Pop Rivet']],
          ['gauge', 'Gauge', 'number', null, false, false, []],
        ]},
      ]},
      { name: 'Door & Window Hardware', slug: 'door-window-hardware', uom: 'NOS', attrs: [
        ['dwh_material', 'Material', 'enum', null, true, true, ['Stainless Steel', 'Brass', 'Aluminium', 'Iron', 'Zinc Alloy']],
        ['dwh_finish', 'Finish', 'enum', null, true, true,
          ['SS Finish', 'Antique Brass', 'Matte Black', 'Chrome', 'Powder Coated', 'Rose Gold']],
      ], children: [
        { name: 'Locks', slug: 'locks', uom: 'NOS', attrs: [
          ['lock_type', 'Lock Type', 'enum', null, true, true,
            ['Mortise', 'Cylindrical', 'Padlock', 'Rim Lock', 'Digital / Smart', 'Drawer Lock']],
          ['key_type', 'Key Type', 'enum', null, true, true, ['Single Side', 'Both Side', 'Knob', 'Keyless']],
          ['backset', 'Backset', 'number', 'mm', true, false, ['45', '57', '60', '70']],
          ['number_of_keys', 'Number of Keys', 'number', null, false, false, []],
        ]},
        { name: 'Hinges', slug: 'hinges', uom: 'NOS', attrs: [
          ['hinge_type', 'Hinge Type', 'enum', null, true, true, ['Butt', 'Piano', 'Concealed / Euro', 'Spring', 'Pivot']],
          ['hinge_size', 'Size', 'number', 'mm', true, true, ['50', '75', '100', '125', '150']],
          ['bearing_type', 'Bearing Type', 'enum', null, false, false, ['Ball Bearing', 'Plain', 'Soft Close']],
        ]},
        { name: 'Handles & Knobs', slug: 'handles-knobs', uom: 'NOS', attrs: [
          ['dwh_handle_type', 'Handle Type', 'enum', null, true, true, ['Door Handle', 'Cabinet Handle', 'Knob', 'Pull Handle']],
          ['centre_to_centre', 'Centre-to-Centre', 'number', 'mm', true, true, ['96', '128', '160', '192', '224', '256']],
          ['handle_length', 'Length', 'number', 'mm', true, false, []],
        ]},
        { name: 'Closers & Door Accessories', slug: 'closers-accessories', uom: 'NOS', attrs: [
          ['closer_product_type', 'Product Type', 'enum', null, true, true,
            ['Door Closer', 'Floor Spring', 'Tower Bolt', 'Aldrop', 'Door Stopper', 'Magnetic Catcher']],
          ['door_weight_capacity', 'Door Weight Capacity', 'number', 'kg', true, true, ['45', '65', '80', '100', '120']],
          ['power_grade', 'Power Grade', 'enum', null, false, false, ['EN1', 'EN2', 'EN3', 'EN4']],
        ]},
      ]},
    ],
  },

  {
    // display_order follows the doc: aesthetic attributes first, technical last (0004).
    name: 'Lights', slug: 'lights', uom: 'NOS', attrs: [
      ['light_style', 'Style / Theme', 'enum', null, false, true,
        ['Modern', 'Contemporary', 'Traditional', 'Industrial', 'Vintage', 'Minimalist', 'Bohemian']],
      ['light_finish', 'Finish', 'enum', null, true, true, ['Gold', 'Black', 'Chrome', 'Antique Brass', 'White', 'Wood', 'Copper']],
      ['light_body_material', 'Body Material', 'enum', null, true, true, ['Metal', 'Glass', 'Crystal', 'Wood', 'Fabric', 'Acrylic', 'Rattan']],
      ['number_of_lights', 'Number of Lights', 'number', null, true, true, ['1', '2', '3', '5', '6', '8', '12']],
      ['lamp_holder_type', 'Lamp Holder Type', 'enum', null, false, true, ['B22', 'E27', 'E14', 'G9', 'GU10', 'Integrated LED']],
      ['light_dimmable', 'Dimmable', 'boolean', null, false, false, []],
      ['bulb_included', 'Bulb Included', 'boolean', null, false, false, []],
    ],
    children: [
      { name: 'Ceiling Lights', slug: 'ceiling-lights', uom: 'NOS', attrs: [
        ['ceiling_fixture_type', 'Fixture Type', 'enum', null, true, true,
          ['Chandelier', 'Pendant', 'Flush Mount', 'Semi-Flush', 'Cove / Profile', 'Track', 'Spotlight']],
        ['diameter_width', 'Diameter / Width', 'number', 'mm', true, true, []],
        ['drop_length', 'Drop Length', 'number', 'mm', true, false, []],
        ['height_adjustable', 'Height Adjustable', 'boolean', null, false, false, []],
      ]},
      { name: 'Wall Lights', slug: 'wall-lights', uom: 'NOS', attrs: [
        ['wall_fixture_type', 'Fixture Type', 'enum', null, true, true,
          ['Wall Sconce', 'Picture / Mirror Light', 'Up-Down Light', 'Swing Arm', 'Wall Washer']],
        ['light_direction', 'Light Direction', 'enum', null, true, true, ['Up', 'Down', 'Up & Down']],
        ['projection', 'Projection', 'number', 'mm', false, false, []],
      ]},
      { name: 'Outdoor & Garden Lights', slug: 'outdoor-garden', uom: 'NOS', attrs: [
        ['outdoor_fixture_type', 'Fixture Type', 'enum', null, true, true,
          ['Gate / Post Light', 'Bollard', 'Spike Light', 'Wall Lantern', 'String Light', 'Flood Light', 'Step Light']],
        ['ip_rating_outdoor', 'IP Rating', 'enum', null, true, true, ['IP44', 'IP54', 'IP65', 'IP66', 'IP67']],
        ['solar_powered', 'Solar Powered', 'boolean', null, true, true, []],
      ]},
      { name: 'Lamps', slug: 'lamps', uom: 'NOS', attrs: [
        ['decorative_lamp_type', 'Lamp Type', 'enum', null, true, true, ['Table Lamp', 'Floor Lamp', 'Desk Lamp', 'Bedside Lamp']],
        ['lamp_height', 'Height', 'number', 'mm', true, true, []],
        ['shade_material', 'Shade Material', 'enum', null, true, true, ['Fabric', 'Glass', 'Metal', 'Paper']],
        ['switch_type', 'Switch Type', 'enum', null, false, false, ['Inline', 'Touch', 'Foot', 'Pull Chain']],
      ]},
    ],
  },

  {
    name: 'Tiles', slug: 'tiles', uom: 'BOX', attrs: [
      ['tile_material', 'Tile Material', 'enum', null, true, true,
        ['Vitrified (GVT)', 'Vitrified (PGVT)', 'Ceramic', 'Porcelain', 'Mosaic', 'Cement / Terrazzo']],
      ['tile_size', 'Size', 'enum', 'mm', true, true,
        ['300×300', '300×450', '250×375', '600×600', '600×1200', '800×800', '1200×1800']],
      ['tile_finish', 'Finish', 'enum', null, true, true,
        ['Glossy', 'Matte', 'Satin', 'Rustic', 'Carving', 'Polished', 'Sugar', 'Lappato']],
      ['tile_colour_family', 'Colour Family', 'enum', null, true, true,
        ['White', 'Beige', 'Grey', 'Brown', 'Black', 'Blue', 'Wood', 'Multi']],
      ['tile_thickness', 'Thickness', 'number', 'mm', true, false, ['6', '8', '9', '10', '12']],
      ['tile_pattern', 'Pattern', 'enum', null, false, true, ['Plain', 'Marble', 'Wood', 'Stone', 'Geometric', 'Digital Print']],
      ['pei_rating', 'PEI / Abrasion Rating', 'enum', null, false, true, ['PEI I', 'PEI II', 'PEI III', 'PEI IV', 'PEI V']],
      ['anti_skid', 'Anti-Skid', 'boolean', null, false, true, []],
      ['shade_variation', 'Shade Variation', 'enum', null, false, false, ['V1', 'V2', 'V3', 'V4']],
      ['tiles_per_box', 'Tiles per Box', 'number', 'pcs', false, false, []],
      ['coverage_per_box', 'Coverage per Box', 'number', 'sqft', false, false, []],
      ['water_absorption', 'Water Absorption', 'number', '%', false, false, []],
    ],
    children: [
      { name: 'Floor Tiles', slug: 'floor-tiles', uom: 'BOX', attrs: [
        ['floor_application_area', 'Application Area', 'enum', null, false, true,
          ['Living Room', 'Bedroom', 'Kitchen', 'Bathroom', 'Commercial']],
      ]},
      { name: 'Wall Tiles', slug: 'wall-tiles', uom: 'BOX', attrs: [
        ['wall_application_area', 'Application Area', 'enum', null, false, true,
          ['Kitchen Backsplash', 'Bathroom', 'Living Room', 'Exterior']],
        ['highlighter', 'Highlighter', 'boolean', null, false, true, []],
      ]},
      { name: 'Outdoor & Parking Tiles', slug: 'outdoor-parking', uom: 'BOX', attrs: [
        ['load_class', 'Load Class', 'enum', null, true, true, ['Light', 'Medium', 'Heavy']],
        ['anti_skid_rating', 'Anti-Skid Rating', 'enum', null, false, true, ['R9', 'R10', 'R11', 'R12', 'R13']],
      ]},
      { name: 'Elevation Tiles', slug: 'elevation-tiles', uom: 'BOX', attrs: [
        ['elevation_type', 'Elevation Type', 'enum', null, true, true, ['Cladding', 'HD Elevation', '3D']],
        ['weather_resistant', 'Weather Resistant', 'boolean', null, false, true, []],
      ]},
    ],
  },

  {
    name: 'Paint', slug: 'paint', uom: 'LTR', attrs: [
      ['sheen', 'Sheen', 'enum', null, true, true, ['Matt', 'Soft Sheen', 'Satin', 'Semi-Gloss', 'High Gloss']],
      ['application_surface', 'Application Surface', 'enum', null, false, true,
        ['Interior Wall', 'Exterior Wall', 'Wood', 'Metal', 'Ceiling']],
      ['washability', 'Washability', 'enum', null, false, true, ['Low', 'Medium', 'High']],
      ['paint_coverage', 'Coverage', 'number', 'sqft/L', false, false, []],
      ['drying_time', 'Drying Time', 'number', 'hours', false, false, []],
      ['low_voc', 'Low VOC / Low Odour', 'boolean', null, false, true, []],
    ],
    children: [
      { name: 'Interior Emulsion', slug: 'interior-emulsion', uom: 'LTR', attrs: [
        ['product_grade', 'Product Grade', 'enum', null, true, true, ['Economy', 'Premium', 'Luxury']],
        ['stain_resistant', 'Stain Resistant', 'boolean', null, false, true, []],
        ['anti_bacterial', 'Anti-Bacterial', 'boolean', null, false, true, []],
      ]},
      { name: 'Exterior Emulsion', slug: 'exterior-emulsion', uom: 'LTR', attrs: [
        ['ext_product_grade', 'Product Grade', 'enum', null, true, true, ['Economy', 'Premium', 'Luxury']],
        ['weather_protection', 'Weather Protection', 'number', 'years', false, true, ['3', '5', '7', '8', '10', '12']],
        ['algae_fungal_resistant', 'Algae & Fungal Resistant', 'boolean', null, false, true, []],
      ]},
      { name: 'Enamel', slug: 'enamel', uom: 'LTR', attrs: [
        ['enamel_type', 'Enamel Type', 'enum', null, true, true, ['Synthetic', 'Water-Based', 'PU']],
      ]},
      { name: 'Primer', slug: 'primer', uom: 'LTR', attrs: [
        ['primer_type', 'Primer Type', 'enum', null, true, true,
          ['Wall Primer', 'Wood Primer', 'Metal / Red Oxide', 'Cement Primer']],
        ['solvent_base', 'Solvent Base', 'enum', null, true, true, ['Water-Based', 'Solvent-Based']],
      ]},
      // Putty is sale_unit_type 'discrete' and sold by weight — never tinted.
      { name: 'Putty', slug: 'putty', uom: 'KG', attrs: [
        ['putty_type', 'Putty Type', 'enum', null, true, true, ['White Cement', 'Acrylic', 'POP']],
      ]},
      { name: 'Waterproofing', slug: 'waterproofing', uom: 'LTR', attrs: [
        ['waterproofing_product_type', 'Product Type', 'enum', null, true, true,
          ['Liquid Membrane', 'Cementitious', 'Bituminous', 'Crystalline', 'Injection Grout']],
        ['waterproofing_application_area', 'Application Area', 'enum', null, true, true,
          ['Terrace', 'Bathroom', 'Basement', 'External Wall', 'Water Tank']],
        ['elongation', 'Elongation', 'number', '%', false, false, []],
      ]},
      { name: 'Wood Finishes', slug: 'wood-finishes', uom: 'LTR', attrs: [
        ['wood_finish_type', 'Finish Type', 'enum', null, true, true, ['PU', 'Melamine', 'Varnish', 'Wood Stain', 'Lacquer']],
      ]},
      { name: 'Texture & Special Finishes', slug: 'texture-finishes', uom: 'LTR', attrs: [
        ['texture_type', 'Texture Type', 'enum', null, true, true, ['Sand', 'Metallic', 'Stucco', 'Marble Finish', 'Concrete']],
        ['application_tool', 'Application Tool', 'enum', null, false, false, ['Roller', 'Trowel', 'Spray', 'Brush']],
      ]},
    ],
  },

  {
    // Per 0003, master_product identity for stone is variety + finish + thickness,
    // so Finish and Thickness are variant-defining. Variety itself is
    // master_product.stone_variety_id (finding 3), and grade is a vendor claim
    // on vendor_listing.stated_grade (0009) — neither is an attribute.
    name: 'Stone', slug: 'stone', uom: 'SQFT', attrs: [
      ['stone_finish', 'Finish', 'enum', null, true, true,
        ['Polished', 'Honed', 'Flamed', 'Leather', 'Brushed', 'Bush Hammered', 'Sandblasted']],
      ['stone_thickness', 'Thickness', 'number', 'mm', true, true, ['16', '18', '20', '25', '30']],
      ['slab_tile_size', 'Slab / Tile Size', 'text', 'mm', true, true, []],
      ['stone_colour_family', 'Colour Family', 'enum', null, false, true,
        ['Black', 'White', 'Grey', 'Brown', 'Beige', 'Green', 'Red', 'Multi']],
      ['stone_application', 'Application', 'enum', null, false, true,
        ['Flooring', 'Countertop', 'Wall Cladding', 'Staircase', 'Elevation']],
      ['edge_type', 'Edge Type', 'enum', null, false, false, ['Machine Cut', 'Hand Cut']],
    ],
    children: [
      { name: 'Natural Stone', slug: 'natural-stone', uom: 'SQFT', attrs: [
        ['stone_type', 'Stone Type', 'enum', null, true, true, ['Granite', 'Marble', 'Kota', 'Sandstone', 'Slate', 'Limestone']],
        ['origin_region', 'Origin Region', 'text', null, false, true, []],
        ['porosity', 'Porosity', 'enum', null, false, false, ['Low', 'Medium', 'High']],
      ]},
      { name: 'Engineered Stone', slug: 'engineered-stone', uom: 'SQFT', attrs: [
        ['engineered_type', 'Engineered Type', 'enum', null, true, true, ['Quartz', 'Engineered Marble', 'Sintered Stone']],
        ['consistency_guarantee', 'Consistency Guarantee', 'boolean', null, false, true, []],
      ]},
    ],
  },
];

module.exports = { UNITS, GLOBAL_ATTRIBUTES, TREE };
