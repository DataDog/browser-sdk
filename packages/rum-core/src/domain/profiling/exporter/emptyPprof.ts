// Empty PPROF file. This is a base64 encoded string of an empty pprof file.
const emptyPprofBase64 = `H4sIAAAAAAAE/5zQO2sUURQHcGd2ZvfunZnk7OTBSQodtrTYca8iamFj42ewibPjNVkzj2XuLGu6
VeyTwheIEBBUiJ1gERWFFGn9BhaKLwIBLYIEguRc1xVLm8ve87vn7P/MJYsZYF4eDgNusQpY3GI2
mNxiVfpdA7PZYAa+Odhch6bNDHjvgXGcMQMYsqDebDATt9ZerkPTZia8BkITOHLCCm4/1FiBOz5h
BRx0CC1c3dBowYFGC1x0CW18/lGjDY+ROm3w0COs4t6OxircniOswgROENZw7+smpa3BfYewBpM4
Scjw0ReNDD5xQgaAQFjH3Z9b1FmHoUFYhwY2At8/6vPtyttbAR28bpgVy67WWH3eZiYOD78Dx3tP
X1Ezh51j1MxhCqdosoMfnml04EFA6MA0ThO6+GRDows3NbowgzOEHu7v60we/NCZPJjF2cD353y+
U393I6CDW9xxPYqzXrm49uLb592731dx3mLGGUMcEbbqRbEUdmellEp4UZLk8ULeuSbjUgk7zvtZ
KZyIqvql1836Sv554uirtomin5XdVLaiw4ZUnAvzXhku5ansFHIQXpBJEhXhYh62W+2zrZNh0u3I
6zIOVRGHhW4Ne0UetxZz4Y5mZXKQjierMirKVHgjHUTLsidmRtdCKlmqXjfLutmigFFZxUvySj+R
YnJUSWlQ+9/CifE/6Rfi/H/sEKl0ISrS06daarxHGiV/Jcrk4HDT9jj670rraj+L22JqFFStqFKm
qozi5V8BAAD//+5zHmiVAwAA`;

// Get the empty pprof blob, to be send alongside the actual data.
// This is temporary until out systems allows only the JSON to be sent.
export const getEmptyPprofBlob = () => base64ToBlob(emptyPprofBase64);

function base64ToBlob(base64: string) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: 'application/octet-stream' });
}
