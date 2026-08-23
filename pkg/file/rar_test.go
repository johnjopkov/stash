package file

import (
	"bytes"
	"encoding/binary"
	"hash/crc32"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	rarBlockArchive = 0x73
	rarBlockFile    = 0x74
	rarBlockEnd     = 0x7b

	rarBlockHasData = 0x8000
	rarArchiveSolid = 0x0008
	rarFileSolid    = 0x0010
)

type storedRarFile struct {
	name  string
	data  []byte
	solid bool
}

func writeRarBlock(t *testing.T, w io.Writer, blockType byte, flags uint16, data []byte) {
	t.Helper()

	header := make([]byte, 7+len(data))
	header[2] = blockType
	binary.LittleEndian.PutUint16(header[3:5], flags)
	binary.LittleEndian.PutUint16(header[5:7], uint16(len(header)))
	copy(header[7:], data)
	binary.LittleEndian.PutUint16(header[0:2], uint16(crc32.ChecksumIEEE(header[2:])))

	_, err := w.Write(header)
	require.NoError(t, err)
}

// writeStoredRar writes the small subset of the RAR 4 format needed for test
// fixtures. File bodies use the store method, so no RAR encoder is required.
func writeStoredRar(t *testing.T, filename string, solid bool, files ...storedRarFile) {
	t.Helper()

	var archive bytes.Buffer
	_, err := archive.WriteString("Rar!\x1a\x07\x00")
	require.NoError(t, err)

	archiveFlags := uint16(0)
	if solid {
		archiveFlags |= rarArchiveSolid
	}
	writeRarBlock(t, &archive, rarBlockArchive, archiveFlags, make([]byte, 6))

	for _, file := range files {
		name := []byte(filepath.ToSlash(file.name))
		headerData := make([]byte, 25+len(name))
		binary.LittleEndian.PutUint32(headerData[0:4], uint32(len(file.data)))
		binary.LittleEndian.PutUint32(headerData[4:8], uint32(len(file.data)))
		headerData[8] = 3 // Unix host OS.
		binary.LittleEndian.PutUint32(headerData[9:13], crc32.ChecksumIEEE(file.data))
		headerData[17] = 20   // Minimum unpacker version.
		headerData[18] = 0x30 // Store without compression.
		binary.LittleEndian.PutUint16(headerData[19:21], uint16(len(name)))
		binary.LittleEndian.PutUint32(headerData[21:25], 0o644)
		copy(headerData[25:], name)

		flags := uint16(rarBlockHasData)
		if file.solid {
			flags |= rarFileSolid
		}
		writeRarBlock(t, &archive, rarBlockFile, flags, headerData)
		_, err = archive.Write(file.data)
		require.NoError(t, err)
	}

	writeRarBlock(t, &archive, rarBlockEnd, 0, nil)
	require.NoError(t, os.WriteFile(filename, archive.Bytes(), 0o600))
}

func TestOsFSOpenZip_Rar(t *testing.T) {
	tests := []struct {
		name      string
		extension string
	}{
		{name: "rar", extension: ".rar"},
		{name: "cbr", extension: ".cbr"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			archivePath := filepath.Join(t.TempDir(), "gallery"+tt.extension)
			contents := []byte("image contents")
			writeStoredRar(t, archivePath, false, storedRarFile{
				name: "pages/001.jpg",
				data: contents,
			})

			info, err := os.Stat(archivePath)
			require.NoError(t, err)

			archiveFS, err := (&OsFS{}).OpenZip(archivePath, info.Size())
			require.NoError(t, err)
			defer archiveFS.Close()

			root, err := archiveFS.Stat(archivePath)
			require.NoError(t, err)
			assert.True(t, root.IsDir())

			var walked []string
			err = SymWalk(archiveFS, archivePath, func(path string, d fs.DirEntry, err error) error {
				require.NoError(t, err)
				rel, err := filepath.Rel(archivePath, path)
				require.NoError(t, err)
				walked = append(walked, filepath.ToSlash(rel))
				return nil
			})
			require.NoError(t, err)
			assert.Equal(t, []string{".", "pages", "pages/001.jpg"}, walked)

			page, err := archiveFS.OpenOnly(filepath.Join(archivePath, "pages", "001.jpg"))
			require.NoError(t, err)
			defer page.Close()

			got, err := io.ReadAll(page)
			require.NoError(t, err)
			assert.Equal(t, contents, got)
		})
	}
}

func TestRarFS_OpenSolidFile(t *testing.T) {
	archivePath := filepath.Join(t.TempDir(), "solid.rar")
	contents := []byte("second image")
	writeStoredRar(t, archivePath, true,
		storedRarFile{name: "001.jpg", data: []byte("first image")},
		storedRarFile{name: "002.jpg", data: contents, solid: true},
	)

	archiveFS, err := newRarFS(&OsFS{}, archivePath)
	require.NoError(t, err)
	defer archiveFS.Close()

	page, err := archiveFS.OpenOnly(filepath.Join(archivePath, "002.jpg"))
	require.NoError(t, err)
	defer page.Close()

	got, err := io.ReadAll(page)
	require.NoError(t, err)
	assert.Equal(t, contents, got)
}
