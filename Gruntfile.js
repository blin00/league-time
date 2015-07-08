'use strict';

module.exports = function(grunt) {
    grunt.initConfig({
        copy: {
            all: {
                files: [
                    {
                        expand: true,
                        cwd: 'node_modules/',
                        flatten: true,
                        src: ['bootstrap/dist/css/bootstrap.min.css'],
                        dest: 'public/css/',
                    },
                ],
            },
        },
        cssmin: {
            all: {
                files: [
                    {
                        expand: true,
                        cwd: 'src/',
                        src: '**/*.css',
                        dest: 'public/css/',
                    }
                ],
            },
        },
        browserify: {
            all: {
                options: {
                    configure: function(b) {
                        b.plugin('minifyify', {
                            map: false,
                        });
                    },
                    preBundleCB: function(b) {
                        grunt.task.run('beep');
                    },
                },
                files: [
                    {
                        expand: true,
                        cwd: 'src/',
                        src: ['index.js'],
                        dest: 'public/js/',
                    },
                ],
            },
        },
        shell: {
            nodemon: {
                command: 'nodemon --ignore src/ --ignore public/',
                options: {
                    async: true,
                },
            },
        },
        watch: {
            css: {
                files: ['src/**/*.css'],
                tasks: ['cssmin', 'beep'],
            },
        },
    });
    require('load-grunt-tasks')(grunt);
    grunt.registerTask('default', ['copy', 'cssmin', 'browserify']);
    grunt.registerTask('live', function() {
        grunt.config('browserify.all.options.configure', null);
        grunt.config('browserify.all.options.watch', true);
        grunt.task.run(['default', 'shell:nodemon', 'watch']);
    });
};
