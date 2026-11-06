/**
 * Morse Code Studio
 */

import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild, inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { focusDialog, restoreDialogFocus, trapDialogTabKey } from '../../modal-accessibility';
import { BackdropClickDirective } from '../../backdrop-click.directive';
import { BackCloseDirective } from '../../back-close.directive';

/** One emoji with the words it can be found by */
interface EmojiEntry {
  emoji: string;
  /** Lower-case name and tags, searched as one text */
  keywords: string;
}

/** A named group of emojis displayed as a tab in the picker */
interface EmojiCategory {
  name: string;
  emojis: EmojiEntry[];
}

/**
 * Tab names by Unicode group number, as used by emojibase (group 2, skin-tone
 * components, is left out because those are not emojis on their own).
 */
const CATEGORY_NAMES: Record<number, string> = {
  0: 'Smileys',
  1: 'People',
  3: 'Nature',
  4: 'Food',
  5: 'Travel',
  6: 'Activities',
  7: 'Objects',
  8: 'Symbols',
  9: 'Flags',
};

/**
 * Emoji Picker Modal Component
 *
 * Provides a visual emoji selection interface with categories and search.
 * The full emoji list (names and tags from `emojibase-data`) is loaded the first
 * time the picker opens, as its own lazy chunk, so it does not weigh on start-up.
 * Search finds an emoji by any word of its name or tags ("fireworks", "party",
 * "celebration"), across all categories.
 * Emitted selection can be used to populate form fields in the parent component.
 */
@Component({
  selector: 'app-emoji-picker',
  standalone: true,
  imports: [FormsModule, BackdropClickDirective, BackCloseDirective],
  templateUrl: './emoji-picker.component.html',
  styleUrls: ['./emoji-picker.component.css']
})
export class EmojiPickerComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;

  private readonly cdr = inject(ChangeDetectorRef);

  private readonly focusReturnTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  /** The browser Back button closes the picker like Close */
  readonly backClose = (): void => { this.close(); };

  /** Emitted when the user selects an emoji from the grid */
  @Output() emojiSelected = new EventEmitter<string>();

  /** Emitted when the user closes the picker without selecting */
  @Output() closed = new EventEmitter<void>();

  /** Current search text — when non-empty, all categories are searched */
  searchQuery = '';

  /** Currently active emoji category tab */
  activeCategory = 'Smileys';

  /** Emoji library organised by category; empty until the data has loaded */
  categories: EmojiCategory[] = [];

  /** True while the emoji data is loading */
  loading = true;

  /** True when the emoji data could not be loaded */
  loadFailed = false;

  async ngOnInit(): Promise<void> {
    try {
      const module = await import('emojibase-data/en/compact.json');
      const data = (module as { default: { group?: number; label: string; tags?: string[]; unicode: string; order?: number }[] }).default;
      const byGroup = new Map<number, EmojiEntry[]>();
      for (const item of [...data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
        if (item.group === undefined || !(item.group in CATEGORY_NAMES)) continue;
        const list = byGroup.get(item.group) ?? [];
        list.push({ emoji: item.unicode, keywords: [item.label, ...(item.tags ?? [])].join(' ').toLowerCase() });
        byGroup.set(item.group, list);
      }
      this.categories = Object.entries(CATEGORY_NAMES)
        .map(([group, name]) => ({ name, emojis: byGroup.get(Number(group)) ?? [] }))
        .filter(category => category.emojis.length > 0);
    } catch {
      this.loadFailed = true;
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  ngAfterViewInit(): void {
    if (this.dialog) focusDialog(this.dialog.nativeElement, '.close-btn');
  }

  ngOnDestroy(): void {
    restoreDialogFocus(this.focusReturnTarget);
  }

  /**
   * Returns the emojis to display based on the active category or search query.
   *
   * With a search query, every word typed must appear in an emoji's name or tags
   * (or the query is the emoji itself); all categories are searched.
   * Otherwise returns the emojis of the selected category tab.
   */
  get filteredEmojis(): string[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      const cat = this.categories.find(c => c.name === this.activeCategory);
      return cat ? cat.emojis.map(e => e.emoji) : [];
    }
    const words = query.split(/\s+/);
    return this.categories
      .flatMap(c => c.emojis)
      .filter(e => e.emoji === query || words.every(w => e.keywords.includes(w)))
      .map(e => e.emoji);
  }

  /** Switch to a category tab by name and clear any active search */
  selectCategory(name: string): void {
    this.activeCategory = name;
    this.searchQuery = '';
  }

  /** Emit the selected emoji to the parent component */
  selectEmoji(emoji: string): void {
    this.emojiSelected.emit(emoji);
  }

  /** Close only the emoji picker when it is the topmost open view. */
  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else if (this.dialog) {
      trapDialogTabKey(event, this.dialog.nativeElement);
    }
  }

  /** Close the picker without selecting an emoji */
  close(): void {
    this.closed.emit();
  }
}
