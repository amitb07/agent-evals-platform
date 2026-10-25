import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import InfoTip from './InfoTip.vue';

const tip = () => document.body.querySelector('[role="tooltip"]');

describe('InfoTip', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the text on hover and links it to the trigger', async () => {
    const w = mount(InfoTip, {
      props: { label: 'About MDE', text: 'Minimum detectable effect' },
      attachTo: document.body,
    });
    const button = w.get('button');
    expect(button.attributes('aria-label')).toBe('About MDE');
    expect(tip()).toBeNull();

    await button.trigger('mouseenter');
    expect(tip()?.textContent).toContain('Minimum detectable effect');
    expect(button.attributes('aria-describedby')).toBe(tip()?.id);

    await button.trigger('mouseleave');
    expect(tip()).toBeNull();
  });

  it('opens on focus and closes on Escape', async () => {
    const w = mount(InfoTip, {
      props: { label: 'About k', text: 'Repeats per task' },
      slots: { default: '<span>k</span>' },
      attachTo: document.body,
    });
    const button = w.get('button');
    expect(button.text()).toBe('k');

    await button.trigger('focus');
    expect(tip()?.textContent).toContain('Repeats per task');

    await button.trigger('keydown', { key: 'Escape' });
    expect(tip()).toBeNull();
  });
});
