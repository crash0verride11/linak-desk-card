# Linak Desk Card

[![hacs][hacs-image]][hacs-url]

> [Home Assistant][home-assistant] Lovelace Card for controlling desks based on Linak Bluetooth controller.

A modern, feature-rich card for controlling standing desks with intelligent height detection, automatic motion tracking, and adaptive button states.

![linak-desk-card_preview](https://user-images.githubusercontent.com/9998984/107797805-a3a6c800-6d5b-11eb-863a-56ae0343995c.png)

## Features

- **Automatic Motion Detection** - Detects desk movement from height sensor changes (no separate motion sensor required)
- **Smart Button States** - Buttons adapt colors based on desk position relative to sit/stand targets
- **Unit-Aware Defaults** - Automatically detects and uses appropriate defaults for inches or centimeters
- **Visual Feedback** - Animated desk icon, height gauge, and button states show current desk state
- **Flexible Configuration** - Optional sensors for backward compatibility

## Compatibility

Designed to work with:
- [ESPHome Idasen Desk Controller](https://github.com/j5lien/esphome-idasen-desk-controller)
- Desks using Linak Bluetooth controllers (Ikea IDÅSEN, etc.)

## Installation

### HACS (Recommended)

This card is available in [HACS](https://hacs.xyz/) (Home Assistant Community Store).
1. Open HACS
2. Go to "Frontend"
3. Click "+" and search for "Linak Desk Card"
4. Click "Download"

### Manual Installation

1. Download `linak-desk-card.js` from the [latest release](https://github.com/crash0verride11/linak-desk-card/releases)
2. Copy to `config/www/linak-desk-card.js`
3. Add to Lovelace resources:
```yaml
resources:
  - url: /local/linak-desk-card.js
    type: module
```

## Configuration

### Minimal Configuration

```yaml
type: custom:linak-desk-card
name: Office Desk
desk: cover.desk
height_sensor: sensor.desk_height
min_height: 25
max_height: 50
```

### Full Configuration

```yaml
type: custom:linak-desk-card
name: Office Desk
desk: cover.desk
height_sensor: sensor.desk_height
moving_sensor: binary_sensor.desk_moving      # Optional - fallback motion detection
connection_sensor: binary_sensor.desk_connection  # Optional
min_height: 25    # inches or cm
max_height: 50    # inches or cm
sit_height: 30.8  # Optional - defaults based on unit
stand_height: 42.5  # Optional - defaults based on unit
```

### Configuration Options

| Name | Type | Requirement | Description | Default |
|------|------|-------------|-------------|---------|
| `type` | `string` | **Required** | `custom:linak-desk-card` | |
| `name` | `string` | **Optional** | Card name | `` |
| `desk` | `string` | **Required** | Home Assistant cover entity ID | `none` |
| `height_sensor` | `string` | **Required** | Home Assistant sensor entity ID for desk height | `none` |
| `min_height` | `number` | **Required** | Desk height at minimum position (in/cm) | `none` |
| `max_height` | `number` | **Required** | Desk height at maximum position (in/cm) | `none` |
| `sit_height` | `number` | **Optional** | Preferred sitting height | Auto-detected |
| `stand_height` | `number` | **Optional** | Preferred standing height | Auto-detected |
| `moving_sensor` | `string` | **Optional** | Binary sensor for desk motion (fallback) | `none` |
| `connection_sensor` | `string` | **Optional** | Binary sensor for desk connection status | `none` |

### Unit Detection

The card automatically detects the unit of measurement from your `height_sensor` and uses appropriate defaults:

**Inches:**
- `min_height`: 25 in
- `max_height`: 50 in
- `sit_height`: 30.8 in
- `stand_height`: 42.5 in

**Centimeters:**
- `min_height`: 63 cm
- `max_height`: 127 cm
- `sit_height`: 78 cm
- `stand_height`: 108 cm

## How It Works

### Motion Detection

The card detects desk motion in two ways:

1. **Height-based detection** (primary): Monitors height sensor changes. Movement detected when height changes by >0.1 units. Motion state clears after 1.5s of no changes.

2. **Sensor fallback** (optional): If `moving_sensor` is configured, it will be used when height-based detection doesn't detect motion.

### Button States

Buttons adapt their appearance based on desk position:

| Position | Sit Button | Stand Button |
|----------|-----------|--------------|
| At sit target (≤ sit_height + 2) | Blue fill, white text | Grey outline |
| Between midpoint & sit | Blue outline, blue text | Grey outline |
| Between midpoint & stand | Grey outline | Green outline, green text |
| At stand target (≥ stand_height - 2) | Grey outline | Green fill, white text |
| Raising to stand | Grey (inactive) | Green shimmer |
| Lowering to sit | Blue shimmer | Grey (inactive) |

## Credits

This is a heavily modified fork of the original [Linak Desk Card](https://github.com/IhorSyerkov/linak-desk-card) by [@IhorSyerkov](https://github.com/IhorSyerkov).

**Major changes in v2.0+:**
- Complete visual redesign matching Home Assistant design patterns
- Automatic motion detection from height sensor
- Intelligent button states with midpoint-based logic
- Unit-aware configuration with automatic defaults
- Optional sensors for enhanced compatibility
- Removed preset system in favor of sit/stand targets

Original inspiration from [macbury's SmartHouse](https://github.com/macbury/SmartHouse/tree/master/home-assistant/www/custom-lovelace/linak-desk).

## Supported Languages

- English
- Українська (Ukrainian)
- Polish
- German
- Dutch
- French

Translations welcome! Submit a PR to add or improve translations.

## Supported Models

- Ikea IDÅSEN
- Any desk using Linak Bluetooth controller

## Development

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build

# Lint
npm run lint
```

## License

MIT © [crash0verride11](https://github.com/crash0verride11)

Original work © [IhorSyerkov](https://github.com/IhorSyerkov)

[home-assistant]: https://www.home-assistant.io/
[hacs]: https://hacs.xyz
[hacs-url]: https://github.com/hacs/integration
[hacs-image]: https://img.shields.io/badge/hacs-default-orange.svg?style=flat-square
