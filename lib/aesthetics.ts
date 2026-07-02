// Curated fashion-aesthetic catalog for the Discover "Aesthetics" tab.
//
// Pure data + derivation, mirroring lib/discover.ts. Each aesthetic carries
// keywords; the server RPCs in lib/searchIndex.ts match them against the whole
// catalog for counts, previews, and the card's tap-through listings, while
// matchAestheticListings below gives an instant client-side approximation
// from already-loaded rows. The editorial copy itself needs no backing table.

import type { Listing } from '@/types';

export interface Aesthetic {
  slug: string;
  /** Display name, rendered uppercase on the card. */
  name: string;
  /** 1–2 sentence editorial description, clamped to ~3 lines on the card. */
  description: string;
  /** Lowercase fragments matched against listing title / brand / description. */
  keywords: string[];
}

// Alphabetical, like an encyclopedia — the tab reads as a browsable index.
export const AESTHETICS: Aesthetic[] = [
  {
    slug: 'acubi',
    name: 'Acubi',
    description:
      'Seoul-born and quietly futuristic: fold-over waistbands, asymmetric hems and sheer mesh layers in washed greys, staging a tug-of-war between volume and restraint.',
    keywords: ['acubi', 'mesh', 'fold-over', 'asymmetric', 'low rise', 'maxi skirt'],
  },
  {
    slug: 'amekaji',
    name: 'Amekaji',
    description:
      'The Japanese devotion to mid-century American casualwear: selvedge denim, chunky flannel, chore coats and boots reproduced with more care than the originals ever got.',
    keywords: ['amekaji', 'selvedge', 'flannel', 'chore', 'denim jacket', 'red wing', 'levis'],
  },
  {
    slug: 'androgynous',
    name: 'Androgyny',
    description:
      'Clothing stripped of every gendered cue treats the body as a neutral armature: boxy blazers, straight trousers and shirting that reads the same on anyone.',
    keywords: ['androgynous', 'unisex', 'genderless', 'oversized blazer', 'boxy'],
  },
  {
    slug: 'athleisure',
    name: 'Athleisure',
    description:
      'Gym-ready fabrics migrated permanently into the casual wardrobe: leggings, zip-ups and track pants engineered for movement but styled for everything else.',
    keywords: ['athleisure', 'leggings', 'track', 'jogger', 'gym', 'lululemon', 'zip-up'],
  },
  {
    slug: 'avant-garde',
    name: 'Avant-Garde',
    description:
      'Deconstructed seams, warped proportions and fabric treated as sculpture. The garment argues with the idea of clothing itself, and usually wins.',
    keywords: ['avant', 'deconstructed', 'rick owens', 'yohji', 'margiela', 'comme'],
  },
  {
    slug: 'balletcore',
    name: 'Balletcore',
    description:
      'Rehearsal-room softness worn on the street: wrap knits, satin flats, ribbon ties and leg warmers in blush tones that make everything look mid-warm-up.',
    keywords: ['ballet', 'wrap', 'satin', 'ribbon', 'leg warmer', 'tulle', 'flats'],
  },
  {
    slug: 'coastal',
    name: 'Coastal',
    description:
      'Sun-washed linen, breton stripes and rope-soled shoes. Dressing as if the sea is a ten-minute walk away, even when it is several hundred miles.',
    keywords: ['linen', 'coastal', 'breton', 'stripe', 'espadrille', 'seersucker'],
  },
  {
    slug: 'cottagecore',
    name: 'Cottagecore',
    description:
      'Prairie dresses, gingham, hand crochet and smocked florals: a pastoral fantasy of slow mornings and bread that proves itself, rendered in cotton.',
    keywords: ['cottage', 'prairie', 'floral', 'gingham', 'crochet', 'smocked', 'puff sleeve'],
  },
  {
    slug: 'dark-academia',
    name: 'Dark Academia',
    description:
      'Tweed, herringbone, worn leather satchels and turtlenecks the colour of old libraries. Every piece looks like it has already read more than you.',
    keywords: ['tweed', 'herringbone', 'turtleneck', 'oxford', 'loafer', 'corduroy', 'plaid'],
  },
  {
    slug: 'gorpcore',
    name: 'Gorpcore',
    description:
      'Trail hardware worn nowhere near a trail: shell jackets, fleece, trail runners and carabiners, judged by their spec sheets as much as their silhouettes.',
    keywords: ['gorp', 'fleece', 'shell', 'hiking', 'arcteryx', 'patagonia', 'north face', 'salomon'],
  },
  {
    slug: 'grunge',
    name: 'Grunge',
    description:
      'Flannel over band tees, ripped denim and boots that have outlived three owners. Deliberately unbothered; the wear and tear is the point, not the flaw.',
    keywords: ['grunge', 'flannel', 'ripped', 'band tee', 'distressed', 'doc martens'],
  },
  {
    slug: 'minimalism',
    name: 'Minimalism',
    description:
      'A wardrobe reduced to its load-bearing walls: clean tailoring, plain knits and a palette that never raises its voice. Nothing extra, nothing missing.',
    keywords: ['minimal', 'plain', 'essential', 'capsule', 'tailored', 'cos'],
  },
  {
    slug: 'old-money',
    name: 'Old Money',
    description:
      'Cashmere, camel coats and loafers with no visible branding at all. Quiet luxury dresses like the money is so old it no longer needs to introduce itself.',
    keywords: ['old money', 'cashmere', 'camel', 'quiet luxury', 'loafer', 'ralph lauren', 'polo'],
  },
  {
    slug: 'preppy',
    name: 'Preppy',
    description:
      'Rugby shirts, cable knits, chinos and boat shoes: the campus uniform of an imagined Ivy League autumn, pressed and ready for a regatta that may never happen.',
    keywords: ['preppy', 'rugby', 'cable knit', 'chino', 'lacoste', 'tommy', 'boat shoe'],
  },
  {
    slug: 'punk',
    name: 'Punk',
    description:
      'Studded leather, safety pins, tartan and slogans done by hand. Less an outfit than an argument; the tailoring is hostile on purpose.',
    keywords: ['punk', 'stud', 'tartan', 'leather jacket', 'safety pin', 'vivienne'],
  },
  {
    slug: 'streetwear',
    name: 'Streetwear',
    description:
      'Graphic tees, heavyweight hoodies and sneakers with lineage. Built on drops, resale and the conviction that a logo can carry an entire silhouette.',
    keywords: ['streetwear', 'hoodie', 'graphic tee', 'sneaker', 'supreme', 'stussy', 'bape', 'jordan'],
  },
  {
    slug: 'techwear',
    name: 'Techwear',
    description:
      'Waterproof nylon, taped seams, magnetic buckles and cargo storage for a city that behaves like weather. Function pushed until it becomes the style.',
    keywords: ['techwear', 'cargo', 'nylon', 'waterproof', 'tactical', 'buckle', 'acronym'],
  },
  {
    slug: 'vintage',
    name: 'Vintage',
    description:
      'True decade pieces: 80s leather, 90s denim, deadstock finds with the original tags. The appeal is provenance; nothing new can be this specific.',
    keywords: ['vintage', 'retro', '90s', '80s', '70s', 'deadstock'],
  },
  {
    slug: 'workwear',
    name: 'Workwear',
    description:
      'Duck canvas, chore coats, double-knee trousers and overalls built for jobsites and adopted everywhere else. It gets better the harder it is worn.',
    keywords: ['workwear', 'duck canvas', 'chore coat', 'overall', 'carhartt', 'dickies', 'double knee'],
  },
  {
    slug: 'y2k',
    name: 'Y2K',
    description:
      'Low-rise everything, baby tees, velour and rhinestones: the millennium bug as a dress code, back from the archive with its optimism intact.',
    keywords: ['y2k', 'low rise', 'baby tee', 'velour', 'rhinestone', 'butterfly', '2000s'],
  },
];

// Live listings whose text mentions any of the aesthetic's keywords. Used for
// the preview collage + count on each card; sold / imageless rows are skipped
// because they can't be shown or bought.
export function matchAestheticListings(aesthetic: Aesthetic, listings: Listing[]): Listing[] {
  return listings.filter((l) => {
    if (l.is_sold || l.images.length === 0) return false;
    const hay = `${l.title} ${l.brand ?? ''} ${l.description ?? ''}`.toLowerCase();
    return aesthetic.keywords.some((k) => hay.includes(k));
  });
}

// Catalog subset matching a free-text query (name, slug or any keyword), so
// the search bar filters the index like the reference design. Empty query
// returns the full alphabetical catalog.
export function filterAesthetics(query: string): Aesthetic[] {
  const q = query.trim().toLowerCase();
  if (!q) return AESTHETICS;
  return AESTHETICS.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.slug.includes(q) ||
      a.keywords.some((k) => k.includes(q) || q.includes(k)),
  );
}
