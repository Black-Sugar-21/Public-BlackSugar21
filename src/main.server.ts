import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

// Angular 20+/21: the server bootstrap MUST receive the BootstrapContext and forward it to
// bootstrapApplication — otherwise prerender throws NG0401 ("Missing Platform / BootstrapContext").
const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default bootstrap;
