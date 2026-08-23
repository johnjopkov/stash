package models

import (
	"io"
	"io/fs"
)

// FileOpener provides an interface to open a file.
type FileOpener interface {
	Open() (io.ReadCloser, error)
}

// FS represents a file system.
type FS interface {
	Stat(name string) (fs.FileInfo, error)
	Lstat(name string) (fs.FileInfo, error)
	Open(name string) (fs.ReadDirFile, error)
	// OpenZip opens a supported gallery archive. The legacy name is retained
	// because archive membership is stored in ZipFile fields in the data model.
	OpenZip(name string, size int64) (ZipFS, error)
	IsPathCaseSensitive(path string) (bool, error)
}

// ZipFS represents a gallery archive file system. The legacy name is retained
// because archive membership is stored in ZipFile fields in the data model.
type ZipFS interface {
	FS
	io.Closer
	OpenOnly(name string) (io.ReadCloser, error)
}
