package manager

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stashapp/stash/pkg/models"
	"github.com/stashapp/stash/pkg/models/mocks"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestFindGalleriesToCleanIncludesNoGalleryFolders(t *testing.T) {
	cleanPath := t.TempDir()
	outsideCleanPath := t.TempDir()

	createGalleryFolder := func(root, name string, markers ...string) string {
		t.Helper()

		path := filepath.Join(root, name)
		require.NoError(t, os.MkdirAll(path, 0755))
		for _, marker := range markers {
			require.NoError(t, os.WriteFile(filepath.Join(path, marker), nil, 0644))
		}

		return path
	}

	emptyGallery := &models.Gallery{ID: 1, Path: createGalleryFolder(cleanPath, "empty")}
	emptyNoGalleryFolderID := models.FolderID(2)
	emptyNoGallery := &models.Gallery{
		ID:       2,
		Path:     createGalleryFolder(cleanPath, "empty-nogallery", ".nogallery"),
		FolderID: &emptyNoGalleryFolderID,
	}
	noGalleryFolderID := models.FolderID(3)
	noGallery := &models.Gallery{
		ID:       3,
		Path:     createGalleryFolder(cleanPath, "nogallery", ".nogallery"),
		FolderID: &noGalleryFolderID,
	}
	regularFolderID := models.FolderID(4)
	regular := &models.Gallery{
		ID:       4,
		Path:     createGalleryFolder(cleanPath, "regular"),
		FolderID: &regularFolderID,
	}
	outsideFolderID := models.FolderID(5)
	outside := &models.Gallery{
		ID:       5,
		Path:     createGalleryFolder(outsideCleanPath, "nogallery", ".nogallery"),
		FolderID: &outsideFolderID,
	}
	userCreated := &models.Gallery{
		ID:   6,
		Path: createGalleryFolder(cleanPath, "user-created", ".nogallery"),
	}
	forcedFolderID := models.FolderID(7)
	forced := &models.Gallery{
		ID:       7,
		Path:     createGalleryFolder(cleanPath, "forced", ".nogallery", ".forcegallery"),
		FolderID: &forcedFolderID,
	}

	db := mocks.NewDatabase()
	emptyGalleryFilter := mock.MatchedBy(func(filter *models.GalleryFilterType) bool {
		return filter != nil && filter.ImageCount != nil &&
			filter.ImageCount.Value == 0 &&
			filter.ImageCount.Modifier == models.CriterionModifierEquals
	})

	db.Gallery.On("Query", mock.Anything, emptyGalleryFilter, mock.Anything).
		Return([]*models.Gallery{emptyGallery, emptyNoGallery}, 2, nil).Once()
	db.Gallery.On("Query", mock.Anything, emptyGalleryFilter, mock.Anything).
		Return([]*models.Gallery{}, 0, nil).Once()
	db.Gallery.On("Query", mock.Anything, (*models.GalleryFilterType)(nil), mock.Anything).
		Return([]*models.Gallery{emptyNoGallery, noGallery, regular, outside, userCreated, forced}, 6, nil).Once()
	db.Gallery.On("Query", mock.Anything, (*models.GalleryFilterType)(nil), mock.Anything).
		Return([]*models.Gallery{}, 0, nil).Once()

	j := cleanJob{
		repository: db.Repository(),
		input: CleanMetadataInput{
			Paths: []string{cleanPath},
		},
	}

	got, err := j.findGalleriesToClean(context.Background())
	require.NoError(t, err)
	assert.Equal(t, []int{emptyGallery.ID, emptyNoGallery.ID, noGallery.ID}, got)
	db.Gallery.AssertExpectations(t)
}
