package file

import (
	"errors"
	"io"
	"io/fs"
	"path"
	"path/filepath"
	"strings"

	"github.com/nwaples/rardecode/v2"
	"github.com/stashapp/stash/pkg/models"
)

// rarFS is a file system backed by a RAR archive.
type rarFS struct {
	*rardecode.RarFS
	fs      models.FS
	rarPath string
}

// standardFS adapts models.FS to io/fs.FS. Go does not allow the more specific
// fs.ReadDirFile return type from models.FS.Open to satisfy fs.FS directly.
type standardFS struct {
	models.FS
}

func (f standardFS) Open(name string) (fs.File, error) {
	return f.FS.Open(name)
}

func newRarFS(f models.FS, archivePath string) (*rarFS, error) {
	rfs, err := rardecode.OpenFS(archivePath, rardecode.FileSystem(standardFS{f}))
	if err != nil {
		return nil, err
	}

	return &rarFS{
		RarFS:   rfs,
		fs:      f,
		rarPath: archivePath,
	}, nil
}

func (f *rarFS) rel(name string) (string, error) {
	if f.rarPath == name {
		return ".", nil
	}

	relName, err := filepath.Rel(f.rarPath, name)
	if err != nil {
		return "", fs.ErrNotExist
	}

	return filepath.ToSlash(relName), nil
}

func (f *rarFS) Stat(name string) (fs.FileInfo, error) {
	relName, err := f.rel(name)
	if err != nil {
		return nil, err
	}

	return f.RarFS.Stat(relName)
}

func (f *rarFS) Lstat(name string) (fs.FileInfo, error) {
	return f.Stat(name)
}

func (f *rarFS) OpenZip(name string, size int64) (models.ZipFS, error) {
	return nil, errArchiveFSOpenArchive
}

func (f *rarFS) IsPathCaseSensitive(path string) (bool, error) {
	return true, nil
}

func (f *rarFS) Open(name string) (fs.ReadDirFile, error) {
	relName, err := f.rel(name)
	if err != nil {
		return nil, err
	}

	r, err := f.RarFS.Open(relName)
	if errors.Is(err, rardecode.ErrSolidOpen) {
		r, err = f.openSolid(relName)
	}
	if err != nil {
		return nil, err
	}

	return &archiveReadDirFile{File: r}, nil
}

// openSolid provides random-looking access to a file in a solid archive by
// replaying the archive from the start. rardecode.RarFS cannot directly open
// solid entries because they depend on all preceding entries.
func (f *rarFS) openSolid(name string) (fs.File, error) {
	r, err := rardecode.OpenReader(f.rarPath, rardecode.FileSystem(standardFS{f.fs}))
	if err != nil {
		return nil, err
	}

	for {
		header, err := r.Next()
		if err != nil {
			_ = r.Close()
			if errors.Is(err, io.EOF) {
				return nil, &fs.PathError{Op: "open", Path: name, Err: fs.ErrNotExist}
			}
			return nil, err
		}

		headerName := strings.TrimPrefix(path.Clean(header.Name), "/")
		if headerName == name {
			info, err := f.RarFS.Stat(name)
			if err != nil {
				_ = r.Close()
				return nil, err
			}

			return &rarFile{
				ReadCloser: r,
				info:       info,
			}, nil
		}
	}
}

func (f *rarFS) Close() error {
	return nil
}

func (f *rarFS) OpenOnly(name string) (io.ReadCloser, error) {
	return f.Open(name)
}

type rarFile struct {
	io.ReadCloser
	info fs.FileInfo
}

func (f *rarFile) Stat() (fs.FileInfo, error) {
	return f.info, nil
}
