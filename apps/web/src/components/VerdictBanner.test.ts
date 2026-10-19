import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { stats } from '../test-fixtures';
import VerdictBanner from './VerdictBanner.vue';

const render = (s = stats()) =>
  mount(VerdictBanner, { props: { stats: s, baseline: 'base', candidate: 'base-skill' } });

describe('VerdictBanner', () => {
  it('shows Better with the effect, CI, MDE and exclusions', () => {
    const text = render().text();
    expect(text).toContain('Better');
    expect(text).toContain('+0.250');
    expect(text).toContain('[+0.100, +0.400]');
    expect(text).toContain('0.200');
    expect(text).toContain('0 / 2');
    expect(text).toContain('base-skill scores higher than base');
    expect(text).toContain('[+0.050, +0.450]');
  });

  it('shows Worse when the CI is below zero', () => {
    const w = render(stats({ verdict: 'worse', effect: -0.3, ciLow: -0.5, ciHigh: -0.1 }));
    expect(w.text()).toContain('Worse');
    expect(w.text()).toContain('[−0.500, −0.100]');
    expect(w.text()).toContain('scores lower');
    expect(w.get('[data-testid="verdict"]').classes()).toContain('bg-red-50');
  });

  it('shows Inconclusive with the reason from the stats', () => {
    const w = render(
      stats({
        verdict: 'inconclusive',
        ciLow: 0.1,
        verdictNote: 'Only 2 task(s) have valid trials in both arms.',
      }),
    );
    expect(w.text()).toContain('Inconclusive');
    expect(w.text()).toContain('Only 2 task(s)');
  });

  it('says so when nothing is paired yet', () => {
    const w = render(
      stats({ verdict: 'inconclusive', effect: null, ciLow: null, ciHigh: null, nTasks: 0 }),
    );
    expect(w.text()).toContain('No task has valid trials in both arms yet.');
    expect(w.text()).not.toContain('95% CI');
  });
});
