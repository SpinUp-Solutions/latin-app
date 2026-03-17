import StarterKit, { StarterKitOptions } from '@tiptap/starter-kit';
import { Extensions } from '@tiptap/core';
import { Tooltip } from '@/src/components/ui/core/tooltip-extension';
import { Hyperlink } from '@/src/components/ui/core/hyperlink-extension';

export type EditorMode = 'admin' | 'student' | 'readonly' | 'simple';

export interface ExtensionSetOptions {
  mode: EditorMode;
  enableTooltips?: boolean;
  enableHyperlinks?: boolean;
  enableAnnotations?: boolean;
}

const getStarterKitConfig = (mode: EditorMode): Partial<StarterKitOptions> => {
  if (mode === 'readonly') {
    return {
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      hardBreak: false,
      horizontalRule: false,
      paragraph: false,
      text: false,
    };
  }

  if (mode === 'simple') {
    return {
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      hardBreak: false,
      horizontalRule: false,
      dropcursor: false,
      gapcursor: false,
    };
  }

  return {
    heading: {
      levels: [1, 2, 3],
    },
    blockquote: false,
    codeBlock: false,
    hardBreak: false,
    horizontalRule: false,
  };
};

export const createExtensionSet = ({
  mode,
  enableTooltips = true,
  enableHyperlinks = true,
  enableAnnotations: _enableAnnotations = true,
}: ExtensionSetOptions): Extensions => {
  void _enableAnnotations;
  const extensions: Extensions = [StarterKit.configure(getStarterKitConfig(mode))];

  if (enableTooltips) {
    extensions.push(Tooltip);
  }

  if (enableHyperlinks) {
    extensions.push(Hyperlink);
  }

  return extensions;
};

// Convenience functions for common use cases
export const getAdminExtensions = (options?: Partial<ExtensionSetOptions>) =>
  createExtensionSet({ mode: 'admin', ...options });

export const getStudentExtensions = (options?: Partial<ExtensionSetOptions>) =>
  createExtensionSet({ mode: 'student', ...options });

export const getReadonlyExtensions = (options?: Partial<ExtensionSetOptions>) =>
  createExtensionSet({ mode: 'readonly', ...options });

export const getSimpleExtensions = (options?: Partial<ExtensionSetOptions>) =>
  createExtensionSet({ mode: 'simple', enableTooltips: false, enableAnnotations: false, ...options });
