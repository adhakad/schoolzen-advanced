/**
 * Certificates — TC Structure and Generate TC (module 10).
 *
 * Routing and declarations ONLY. Services and models live in the shared layer folders
 * (shared/services/certificates/, shared/models/certificates/), mirroring the backend's layout.
 */
import { NgModule } from '@angular/core';
import { SharedComponentsModule } from 'src/app/shared/shared-components.module';
import { CertificatesRoutingModule } from './certificates-routing.module';
import { TcStructureComponent } from './tc-structure/tc-structure.component';
import { GenerateTcComponent } from './generate-tc/generate-tc.component';
import { TcCertificateComponent } from './tc-certificate/tc-certificate.component';

@NgModule({
  declarations: [TcStructureComponent, GenerateTcComponent, TcCertificateComponent],
  imports: [SharedComponentsModule, CertificatesRoutingModule]
})
export class CertificatesModule {}
