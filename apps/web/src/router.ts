import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/experiments' },
    { path: '/experiments', component: () => import('./views/ExperimentsList.vue') },
    { path: '/experiments/new', component: () => import('./views/NewExperiment.vue') },
    { path: '/configs/new', component: () => import('./views/NewSkillConfig.vue') },
    {
      path: '/experiments/:id',
      component: () => import('./views/ExperimentCompare.vue'),
      props: true,
    },
    { path: '/trials/:id', component: () => import('./views/TrialDetail.vue'), props: true },
    { path: '/:pathMatch(.*)*', component: () => import('./views/NotFound.vue') },
  ],
});
