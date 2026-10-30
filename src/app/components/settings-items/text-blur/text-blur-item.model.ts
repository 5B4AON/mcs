/**
 * Morse Code Studio
 */

import { OUTPUT_FORWARDS, OutputForward, SettingsFieldRules } from '../../../services/settings-common';
import { ItemDescriptor, labelledReview } from '../item-descriptor';

/** The settings the Text Blurring item owns. */
export interface TextBlurSettings {
  /** Blur decoded text for training purposes */
  textBlurEnabled: boolean;
  /** Which text directions to blur: rx, tx, or both */
  textBlurAppliesTo: OutputForward;
}

export const TEXT_BLUR_DEFAULTS: TextBlurSettings = {
  textBlurEnabled: false,
  textBlurAppliesTo: 'rx',
};

export const TEXT_BLUR_FIELD_RULES: SettingsFieldRules = {
  enums: { textBlurAppliesTo: OUTPUT_FORWARDS },
};

/** What the Text Blurring item edits and says in a review. */
export const TEXT_BLUR_DESCRIPTOR: ItemDescriptor = {
  id: 'text-blur',
  keys: ['textBlurEnabled', 'textBlurAppliesTo'],
  validate: () => [],
  review: labelledReview({
    textBlurEnabled: 'Text blurring',
    textBlurAppliesTo: 'Text blurring applies to',
  }),
};
