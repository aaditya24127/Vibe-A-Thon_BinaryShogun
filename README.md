# WeConnect Community

# WeConnect — Premium Landing Page Implementation

## 1. Your role and objective

Act as a senior frontend engineer, UI/UX designer, and creative developer.

Build a complete, polished, responsive landing page for **WeConnect**, a civic logistics platform that coordinates surplus food, essential supplies, volunteer riders, and receiving shelters.

I have attached a reference image of the exact landing page design I want.

**Treat the attached image as the primary visual source of truth. Reproduce its composition, section order, spacing, proportions, colours, typography, imagery, cards, and overall visual hierarchy as closely as possible.**

Do not redesign it into a generic SaaS landing page. Do not replace its visual identity with an unrelated template.

The result must be a real, functional website built with editable components, CSS, and JavaScript—not a flattened screenshot.

## 2. Project scope and backend separation

Our backend is being developed separately by another teammate using Claude Code. We will connect the frontend to that backend later.

For now:

- Build only the landing page and its frontend interactions.
- Do not create a new backend.
- Do not create database migrations or database schemas.
- Do not implement authentication.
- Do not invent API endpoints.
- Do not connect to Supabase or another backend unless the existing project already requires it.
- Do not overwrite existing backend or unrelated project files.
- Use local illustrative data for the landing-page preview.
- Keep the code modular so real API data can replace the illustrative data later.

First inspect the existing Lovable project and its dependencies. Preserve any existing implementation that is already working.

If the project is empty, use Lovable's standard React, TypeScript, and Vite-compatible setup.

## 3. Brand identity

The exact brand name is:

# WeConnect

Use this spelling and capitalization everywhere.

Do not write WEV Connect, V Connect, We Connect, or other variations.

The logo should use a distinctive stylized red W mark followed by the word WeConnect.

Brand personality:
- Premium and modern.
- Trustworthy and human-centred.
- Socially impactful.
- Technologically sophisticated.
- Clean, professional, and memorable.

The branding should feel like a real startup, not a generic AI-generated website.

## 4. Design system

Reproduce the reference image's cherry-cola and vanilla-cream palette.

Use these starting colour tokens:

- Vanilla cream: #FFF5EA
- Warm cream: #F8EBDD
- White cream: #FFFCF7
- Cherry cola: #650B1B
- Deep burgundy: #390710
- Cherry red: #B5122B
- Soft blush: #F9D9D2
- Primary text: #351018
- Muted text: #76595A

Define these as reusable CSS variables or design tokens.

The page should primarily use cream backgrounds, deep-burgundy typography, and cherry-red accents. Use darker burgundy for the live operations section and footer.

Avoid unrelated purple, blue, neon, or green-heavy styling. Green is acceptable for meaningful map markers or successful-delivery states.

### Typography

Use a distinctive display typeface for the main headings and a clean sans-serif for navigation, labels, and interface elements.

Suggested pairing:
- Display: a suitable editorial serif or expressive display font.
- Interface: Inter, Manrope, or a similar modern sans-serif.

Match the reference image's large, bold hero heading, compact navigation, generous whitespace, and clear text hierarchy.

## 5. Required page structure

Implement exactly these five primary sections, in this order:

1. Header and hero.
2. What We Do at WeConnect.
3. See Aid in Action.
4. Turning Surplus Into Stronger Communities.
5. Footer, including the community CTA banner immediately above it.

Do not add pricing, testimonials, blogs, FAQs, or unrelated sections.

Maintain the reference image's overall proportions and section heights.

---

## SECTION 1 — HEADER AND HERO

### Header

Create a horizontal header on the warm cream background.

Left:
- Stylized cherry-red W logo.
- WeConnect wordmark in deep burgundy.

Centre:
- Home
- Our Solution
- How It Works
- Impact
- About

Right:
- Cherry-red rounded button: **Explore the Platform →**

Navigation items should scroll to their corresponding sections or meaningful destinations.

Use a subtle active state and smooth hover transitions. The header may remain sticky if this matches the reference without obscuring content.

### Hero layout

Use a two-column desktop layout.

Left column: brand heading, tagline, primary CTA, and three benefit indicators.

Right column: a large, high-quality delivery-rider image with floating information cards.

### Main heading

Display:

**WeConnect**

Make it very large, bold, and visually striking.

Use deep burgundy with cherry-red emphasis on the stylized W. Match the typography and placement of the reference image as closely as possible.

Do not place an extra badge or eyebrow heading above the brand name.

### Tagline

Display exactly:

**Connecting Surplus to Need.  
Before It's Too Late.**

Use a prominent but smaller heading beneath WeConnect.

Do not add a long descriptive paragraph under the tagline.

### Primary CTA

Display one primary hero button:

**Explore the Platform →**

Use a cherry-red background, white text, rounded corners, and a subtle hover effect.

Do not add a Watch Demo button or a second hero CTA.

### Three benefit indicators

Display three compact icon-and-label combinations:

- Less Waste
- Faster Deliveries
- Stronger Communities

Use simple cherry-red icons and subtle dividers, matching the reference.

Do not add explanatory text under these labels.

### Hero image

Use a high-quality, realistic image of a volunteer delivery rider on a two-wheeler carrying a branded delivery bag in an urban environment.

The image should have warm natural lighting and blend with the cream and cherry-red visual theme.

Create an organic cherry-red or coral shape behind the image, matching the reference composition.

Use a carefully cropped image with rounded or organically shaped edges.

Do not build a complex 3D scene. A good photographic image is preferred.

Do not use the entire reference screenshot as the hero image.

### Floating hero cards

Overlay three compact information cards around the hero image:

1. Pickup
   - Green Leaf Restaurant
   - 12 min away

2. Delivering
   - 40 Meals
   - ETA: 12 min

3. Shelter A
   - Remaining Demand
   - A compact progress indicator showing 30 / 50 meals

Use cream surfaces, rounded corners, subtle shadows, and appropriate icons.

These values are illustrative placeholders, not verified live data.

Ensure the cards remain legible and are positioned similarly to the reference.

---

## SECTION 2 — WHAT WE DO AT WECONNECT

Use a warm vanilla-cream background.

Heading:

**What We Do At WeConnect**

Emphasize WeConnect in cherry red.

Do not add an "Our Solution" badge or a descriptive paragraph above or below the heading.

### Feature-card carousel

Build a horizontally moving strip of seven feature cards.

The cards should continuously move from left to right in a smooth, seamless loop.

On desktop, show approximately seven cards or as many as comfortably fit the reference layout.

### Seven required cards

1. Smart Allocation
2. Real-time Coordination
3. Safety & Compatibility
4. No More Ghost Reservations
5. Dynamic Rerouting
6. Time-sensitive Deliveries
7. Impact Tracking

### Card contents

Each card must contain only:

- One prominent icon.
- One short feature heading.
- One relevant image.

Do not add descriptions, paragraphs, explanatory captions, or secondary labels.

Suggested imagery:
- Smart Allocation: food containers or supply boxes.
- Real-time Coordination: map pins and delivery routes.
- Safety & Compatibility: shield and essential supplies.
- No More Ghost Reservations: volunteer or reservation illustration.
- Dynamic Rerouting: branching route illustration.
- Time-sensitive Deliveries: clock and food.
- Impact Tracking: growth chart and sustainability imagery.

### Card appearance

Match the reference:
- White-cream surfaces.
- Rounded corners.
- Soft shadows.
- Circular icon backgrounds.
- Consistent card dimensions.
- Large rectangular imagery near the bottom.

Use consistent spacing and alignment.

### Animation requirements

- Continuously animate the card track from left to right.
- Use a seamless looping technique with duplicated card content where appropriate.
- Pause the animation when the pointer enters the card strip.
- Resume when the pointer leaves.
- Do not reset the animation to its starting point on hover.
- Keep movement smooth and linear.
- Ensure the loop has no visible jump.
- Support touch devices and reduced-motion preferences.
- Avoid causing horizontal overflow across the whole page.

If the reference includes previous and next controls, reproduce them where practical. These controls must actually work if displayed.

---

## SECTION 3 — SEE AID IN ACTION

Create a full-width deep-burgundy section with cream and white text.

Match the reference's two-column layout.

### Left column

Heading:

**See Aid in Action**

Use a large, bold heading with cherry or blush emphasis.

Include this concise description:

"Track donations, riders, and shelters in real-time — all on a single dashboard."

Add one cream-coloured CTA:

**View Live Demo →**

This should scroll to the map preview or open a functional local demonstration panel.

Do not invent an external demo URL.

### Operational metrics

Display three compact metrics with icons:

- 24 Active Riders
- 18 Ongoing Deliveries
- 7 Receiving Shelters

Treat these as illustrative demo values.

Keep them in a configurable data structure for future backend integration.

### Right column: map preview

Create a visually convincing logistics map with:
- Donor location.
- Rider location.
- Shelter locations.
- Route lines.
- Location markers.
- A small legend for Donor, Rider, Shelter, and Route.

Use a cream map surface with cherry-red route accents. Use green only where appropriate for successful or available locations.

The map should resemble a real dispatch dashboard, but it does not need live geographic data for this landing-page prototype.

Prefer a well-designed local SVG or map illustration if a real map would introduce unnecessary dependencies or external network requirements.

### Rider status card

Place a cream rider-detail card beside the map.

Show:

- Rider R-04
- In Transit
- Carrying: 40 meals
- To: Shelter A
- ETA: 12 min
- Time remaining: 18 min
- Status: On track

Add a functional button:

**View Details**

It should open a local detail panel, modal, or another meaningful frontend preview.

All information in this section is illustrative. Do not claim it represents real-time tracking.

### Visual quality

Keep the map and rider panel aligned and balanced.

Ensure the burgundy section contrasts strongly with the cream sections above and below it.

Do not allow the map to become an oversized generic embed.

---

## SECTION 4 — TURNING SURPLUS INTO STRONGER COMMUNITIES

Return to the vanilla-cream background.

Heading:

**Turning Surplus Into Stronger Communities**

Use a large, elegant heading with cherry-red emphasis on selected words.

Do not add an "Our Impact" badge or a paragraph below the heading.

### Four impact cards

Arrange four large cards horizontally on desktop.

Card 1:
- Icon: food or cutlery.
- Metric: 1,200+
- Label: Meals Delivered

Card 2:
- Icon: recycling.
- Metric: 94%
- Label: Less Food Waste

Card 3:
- Icon: volunteers.
- Metric: 25+
- Label: Active Volunteers

Card 4:
- Icon: shelter or home.
- Metric: 12+
- Label: Shelters Supported

These figures are illustrative placeholders. Keep them configurable so verified values can replace them later.

### Card styling

Match the reference's elevated, slightly tilted cards:
- Warm cream and soft blush surfaces.
- Rounded corners.
- Layered borders.
- Soft shadows.
- Cherry-red icons and large metrics.
- Subtle decorative flowing shapes behind the cards.

### Interactive 3D hover effect

When the pointer moves over an impact card:
- Raise the card slightly.
- Apply a subtle perspective tilt based on pointer position.
- Increase shadow depth.
- Slightly emphasize the icon or metric.
- Smoothly return the card to its original state on pointer leave.

The effect should feel premium and restrained, not exaggerated.

Support touch devices with a simple active state. Respect reduced-motion preferences.

### Community CTA banner

Immediately below the impact cards, add a wide cherry-red or burgundy banner with subtle flowing decorative shapes.

Heading:

**Be a Part of the Change**

Button:

**Get Started →**

Do not add a long descriptive paragraph.

The CTA should scroll to a clearly defined platform destination or open a local introductory panel. Do not leave it nonfunctional.

---

## SECTION 5 — FOOTER

Create a full-width deep-burgundy footer with subtle flowing wave shapes.

### Left side

Display:
- Stylized W logo.
- WeConnect wordmark.
- Tagline: "Connecting Surplus to Need. Before It's Too Late."

### Centre

Navigation:
- Home
- Our Solution
- How It Works
- Impact
- About

Links should work and scroll to the correct sections.

### Right side

Include social icons for:
- LinkedIn
- Instagram
- X
- YouTube

Do not invent real profile URLs. Use configurable placeholders until actual links are provided.

### Copyright

Display:

**© 2026 WeConnect. All rights reserved.**

Keep the footer compact, balanced, and visually consistent with the reference.

Do not add a paragraph describing donors, volunteers, riders, or shelters.

---

## 6. INTERACTION REQUIREMENTS

Implement real frontend behaviour for:

1. Smooth in-page navigation.
2. Hero CTA scrolling to the platform section.
3. Header navigation and footer links.
4. Continuous feature-card animation.
5. Pause-on-hover and resume-on-leave.
6. Functional View Live Demo interaction.
7. Functional View Details interaction.
8. Subtle 3D impact-card hover effects.
9. Button hover states.
10. Responsive mobile navigation.
11. Reduced-motion accessibility.
12. Meaningful keyboard focus states.

Do not add decorative buttons that do nothing.

If a feature does not have a real backend yet, provide a useful local interaction rather than pretending that a remote operation has occurred.

## 7. RESPONSIVE DESIGN

The supplied image is the primary desktop reference.

### Desktop
- Two-column hero.
- Large delivery image and floating cards.
- Horizontally moving feature cards.
- Two-column operations section.
- Four impact cards in one row.
- Full-width footer.

### Tablet
- Reduce spacing and typography.
- Preserve the visual hierarchy.
- Reposition floating cards where needed.
- Maintain the feature-card carousel.

### Mobile
- Stack hero text and image vertically.
- Keep the brand heading prominent.
- Use a compact mobile navigation.
- Keep CTAs large enough to tap.
- Preserve the feature carousel without page-wide horizontal overflow.
- Stack the operations map and rider panel.
- Display impact cards in a two-column or single-column grid.
- Keep all text readable.

Test at common desktop, tablet, and mobile widths.

## 8. ASSETS AND PERFORMANCE

Use appropriate assets for the rider image, feature-card images, icons, map illustration, and footer decoration.

Prefer existing local assets when available. Otherwise, use suitable image assets or create simple, polished SVG illustrations.

Avoid:
- Broken image URLs.
- Randomly mixed stock imagery.
- Excessive emoji as icons.
- Large unnecessary animation libraries.
- Complex 3D scenes.
- Unnecessary network dependencies.

Use Lucide icons or another consistent icon set already available in the project.

Optimize images and prevent layout shifts.

## 9. COMPONENT ARCHITECTURE

Use reusable React components, such as:

- Header
- HeroSection
- HeroVisual
- FloatingInfoCard
- FeatureCarousel
- FeatureCard
- LiveOperationsSection
- MapPreview
- RiderStatusCard
- ImpactSection
- ImpactCard
- CommunityBanner
- Footer

Store repeated feature cards and metrics in data arrays.

Keep styles consistent through reusable design tokens.

Keep animation logic isolated and maintainable.

Use semantic HTML, descriptive image alt text, and accessible controls.

## 10. FUTURE BACKEND INTEGRATION

The backend is being developed separately.

Prepare the frontend for future integration by keeping the following data configurable:

- Active rider count.
- Ongoing delivery count.
- Receiving shelter count.
- Impact metrics.
- Rider details.
- Donation details.
- Shelter demand.

Use illustrative local data for the current version.

Do not invent API endpoints or introduce backend dependencies.

When the actual API contract becomes available, the relevant data sources can be replaced with backend responses without redesigning the page.

## 11. IMPLEMENTATION AND VERIFICATION

Implement the actual page, not just a design proposal.

After implementation:

1. Run the application.
2. Inspect the rendered page against the supplied reference image.
3. Correct mismatches in spacing, proportions, typography, colours, and section layout.
4. Verify the carousel animation and hover behaviour.
5. Verify the impact-card interaction.
6. Test navigation and all CTA buttons.
7. Check desktop and mobile layouts.
8. Fix build errors, broken assets, and console errors.

Prioritize visual fidelity to the reference over adding unnecessary functionality.

Do not stop after creating the hero section. Complete all five sections.

## FINAL INSTRUCTION

Build the complete WeConnect landing page to closely match the attached reference image.

Preserve the cherry-cola and vanilla-cream identity, minimal text, premium styling, continuous feature carousel, burgundy operations section, interactive impact cards, and clean footer.

Keep the implementation frontend-only and ready for later backend integration.

Inspect the existing project first, implement the full page, run it, and verify the final result.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b4aa1a39-ec87-41cd-a17d-f46e6864b7ee).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
