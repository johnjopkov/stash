package config

import "testing"

func TestImageLightboxScrollModeIsValid(t *testing.T) {
	t.Parallel()

	for _, mode := range []ImageLightboxScrollMode{
		ImageLightboxScrollModeZoom,
		ImageLightboxScrollModePanY,
		ImageLightboxScrollModeNavigate,
	} {
		if !mode.IsValid() {
			t.Errorf("expected %q to be a valid image lightbox scroll mode", mode)
		}
	}

	if ImageLightboxScrollMode("INVALID").IsValid() {
		t.Error("expected an unknown image lightbox scroll mode to be invalid")
	}
}
