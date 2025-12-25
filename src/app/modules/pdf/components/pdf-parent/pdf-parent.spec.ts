import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PdfParent } from './pdf-parent';

describe('PdfParent', () => {
  let component: PdfParent;
  let fixture: ComponentFixture<PdfParent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PdfParent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PdfParent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
