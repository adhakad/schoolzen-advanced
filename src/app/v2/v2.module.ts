import { NgModule } from '@angular/core';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { V2RoutingModule } from './v2-routing.module';
import { V2ShellComponent } from './v2-shell/v2-shell.component';
import { ComponentsGalleryComponent } from './components-gallery/components-gallery.component';
import { NotBuiltComponent } from './not-built/not-built.component';

@NgModule({
  declarations: [V2ShellComponent, ComponentsGalleryComponent, NotBuiltComponent],
  imports: [SharedComponentsModule, V2RoutingModule]
})
export class V2Module {}
