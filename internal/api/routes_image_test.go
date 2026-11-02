package api

import (
	"strconv"
	"testing"

	"github.com/stashapp/stash/pkg/models"
)

func TestImageThumbnailWidth(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  int
	}{
		{name: "empty", want: models.DefaultGthumbWidth},
		{name: "default", value: strconv.Itoa(models.DefaultGthumbWidth), want: models.DefaultGthumbWidth},
		{name: "medium", value: "1280", want: 1280},
		{name: "large", value: "1920", want: 1920},
		{name: "unsupported", value: "4096", want: models.DefaultGthumbWidth},
		{name: "invalid", value: "large", want: models.DefaultGthumbWidth},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := imageThumbnailWidth(tt.value); got != tt.want {
				t.Fatalf("imageThumbnailWidth(%q) = %d, want %d", tt.value, got, tt.want)
			}
		})
	}
}
